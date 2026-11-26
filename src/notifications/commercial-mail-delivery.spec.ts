import { createFixtureMailRunner } from '../../scripts/demo-commercial-mail';
import { deliverCommercialMail } from './commercial-mail-delivery';
import { createConfiguredCommercialMailTransport } from './commercial-mail-transport';
import type { EmailConfiguration, EmailSnapshot } from './email-template';

const origin = 'https://marketplace.example.invalid';
const orderUrl = `${origin}/mis-pedidos`;
const config: EmailConfiguration = { marketplaceOrigin: origin, orderUrl, trackingUrl: orderUrl, supportUrl: orderUrl };
const to = 'qa-marketplace@example.invalid';
const env = { MAIL_PROVIDER: 'mailpit', MAILPIT_BASE_URL: 'http://127.0.0.1:18025', MAIL_TIMEOUT_MS: '100' };
const order = {
  type: 'ORDER_CONFIRMATION', orderId: 'PED-2026-90001', state: 'PAGADO',
  occurredAt: '2026-11-24T15:00:00Z', totalCents: 7990,
} as const satisfies EmailSnapshot;
const shipment = { type: 'SHIPMENT_UPDATE', orderId: order.orderId, occurredAt: order.occurredAt } as const;
const mockFetch = () => jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

describe('disparadores acordados con Ventas en fixtures', () => {
  const detail = {
    pedidoId: order.orderId, estado: 'PAGADO', createdAt: order.occurredAt,
    total: { currency: 'PEN', amount: 79.90 },
  } as const;

  it('envía C-001 una vez al consultar PAGADO para el mismo pedido', async () => {
    const send = jest.fn().mockResolvedValue({ messageId: 'qa-order', httpStatus: 200 });
    const runner = createFixtureMailRunner(order.orderId, to, { send });
    for (const estado of ['CREADO', 'ANULADO'] as const) {
      await expect(runner.onOrderDetail({ ...detail, estado }, order.occurredAt)).resolves.toEqual({ status: 'skipped' });
    }
    await expect(runner.onOrderDetail({ ...detail, pedidoId: 'PED-2026-90002' }, order.occurredAt))
      .resolves.toEqual({ status: 'skipped' });
    const results = await Promise.all([
      runner.onOrderDetail(detail, order.occurredAt),
      runner.onOrderDetail(detail, order.occurredAt),
    ]);
    expect(results).toEqual([
      { status: 'accepted', messageId: 'qa-order', httpStatus: 200, payloadVersion: 'v1' },
      { status: 'duplicate' },
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to, subject: expect.stringContaining(order.orderId) }));
  });

  it('envía C-002 para H-05 DESPACHADO, omite ENTREGADO y deduplica por evento', async () => {
    const send = jest.fn().mockResolvedValue({ messageId: 'qa-shipment', httpStatus: 200 });
    const runner = createFixtureMailRunner(order.orderId, to, { send });
    const event = {
      eventId: '30ba2519-8e05-4d78-af35-4153d1a12f4c',
      timestamp: order.occurredAt,
      data: { orderId: order.orderId, publicStatus: 'DESPACHADO', estimatedDeliveryDate: '2026-11-25' },
    };
    await expect(runner.onShipmentEvent({ ...event, data: { ...event.data, publicStatus: 'ENTREGADO' } }))
      .resolves.toEqual({ status: 'skipped' });
    await expect(runner.onShipmentEvent(event)).resolves.toMatchObject({ status: 'accepted' });
    await expect(runner.onShipmentEvent(event)).resolves.toEqual({ status: 'duplicate' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to, text: expect.stringContaining('Despachado') }));
  });
});

describe('entrega local de correos comerciales', () => {
  it.each([
    [order, 'Pagado'],
    [{ ...shipment, state: 'DESPACHADO' }, 'Despachado'],
  ] as const)('entrega HTML y texto plano para %j', async (snapshot, expectedState) => {
    const fetchImpl = mockFetch().mockResolvedValue(Response.json({ ID: 'qa-message-1' }));
    const transport = createConfiguredCommercialMailTransport(env, fetchImpl);
    await expect(deliverCommercialMail(snapshot, to, config, transport)).resolves.toEqual({
      status: 'accepted', messageId: 'qa-message-1', httpStatus: 200, payloadVersion: 'v1',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [endpoint, options] = fetchImpl.mock.calls[0];
    expect(String(endpoint)).toBe('http://127.0.0.1:18025/api/v1/send');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
    const payload = JSON.parse(String(options?.body));
    expect(payload).toMatchObject({
      From: { Email: 'marketplace@example.invalid' }, To: [{ Email: to }],
      Subject: expect.any(String), HTML: expect.stringContaining(expectedState), Text: expect.stringContaining(expectedState),
    });
    expect(payload.Text).toContain(orderUrl);
    expect(payload.Text).not.toContain('<table');
  });

  it('rechaza la compra no pagada y omite eventos de despacho que no disparan correo', async () => {
    const fetchImpl = mockFetch();
    const transport = createConfiguredCommercialMailTransport(env, fetchImpl);
    const unpaid = { ...order, state: 'CREADO' } as unknown as EmailSnapshot;
    await expect(deliverCommercialMail(unpaid, to, config, transport)).rejects.toThrow('EMAIL_ORDER_NOT_PAID');
    for (const state of ['ASIGNADO', 'EN_CAMINO', 'REPROGRAMADO', 'INCIDENCIA', 'ENTREGADO'] as const) {
      await expect(deliverCommercialMail({ ...shipment, state }, to, config, transport))
        .resolves.toEqual({ status: 'skipped' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rechaza el transporte sin seleccionar, fuera de loopback o en producción', () => {
    expect(() => createConfiguredCommercialMailTransport({})).toThrow('MAIL_PROVIDER_NOT_CONFIGURED');
    expect(() => createConfiguredCommercialMailTransport({ ...env, NODE_ENV: 'production' })).toThrow('MAILPIT_LOCAL_ONLY');
    for (const url of ['https://mail.example.invalid', 'http://127.0.0.1:8025/relay', 'http://127.0.0.1:8025/?redirect=x']) {
      expect(() => createConfiguredCommercialMailTransport({ ...env, MAILPIT_BASE_URL: url })).toThrow('MAILPIT_LOCAL_ONLY');
    }
  });

  it('rechaza un destinatario ajeno al entorno de prueba', async () => {
    const fetchImpl = mockFetch();
    const transport = createConfiguredCommercialMailTransport(env, fetchImpl);
    await expect(deliverCommercialMail(order, 'cliente@example.org', config, transport))
      .rejects.toThrow('MAILPIT_TEST_ADDRESS_REQUIRED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [() => Response.json({ message: 'upstream diagnostic' }, { status: 503 }), 'MAILPIT_HTTP_503'],
    [() => Response.json({}), 'MAILPIT_INVALID_RESPONSE'],
  ])('conserva el fallo sin reenviar el mismo correo automáticamente', async (response, code) => {
    const fetchImpl = mockFetch().mockResolvedValue(response());
    const transport = createConfiguredCommercialMailTransport(env, fetchImpl);
    await expect(deliverCommercialMail(order, to, config, transport)).rejects.toThrow(code);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('detiene una llamada que supera el timeout sin reenvío automático', async () => {
    const fetchImpl = mockFetch().mockImplementation((_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
      }));
    const transport = createConfiguredCommercialMailTransport(env, fetchImpl);
    await expect(deliverCommercialMail(order, to, config, transport)).rejects.toThrow('MAILPIT_TIMEOUT');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('entrega de correos comerciales con Brevo', () => {
  const env = { MAIL_PROVIDER: 'brevo', BREVO_ENABLED: 'true', BREVO_API_KEY: 'unit-test-only', BREVO_SENDER_EMAIL: 'marketplace@example.org' };
  const recipients = {
    PAGADO: 'comprador-1@example.org',
    DESPACHADO: 'comprador-2@example.org',
  };
  const messageId = '<20261125.123@relay.domain.com>';

  it.each([order, { ...shipment, state: 'DESPACHADO' }] as const)(
    'envía el contenido de %j por HTTPS al buzón del comprador',
    async (snapshot) => {
      const fetchImpl = mockFetch().mockResolvedValue(Response.json({ messageId }, { status: 201 }));
      const transport = createConfiguredCommercialMailTransport(env, fetchImpl);
      const to = recipients[snapshot.state];

      await expect(deliverCommercialMail(snapshot, to, config, transport)).resolves.toEqual({
        status: 'accepted', messageId, httpStatus: 201, payloadVersion: 'v1',
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [endpoint, options] = fetchImpl.mock.calls[0];
      expect(String(endpoint)).toBe('https://api.brevo.com/v3/smtp/email');
      expect(options).toMatchObject({
        method: 'POST', redirect: 'error',
        headers: { 'api-key': 'unit-test-only', 'Content-Type': 'application/json' },
      });
      expect(JSON.parse(String(options?.body))).toMatchObject({
        sender: { email: 'marketplace@example.org' }, to: [{ email: to }],
        subject: expect.any(String), htmlContent: expect.stringContaining(orderUrl),
        textContent: expect.stringContaining(orderUrl),
      });
    },
  );

  it('mantiene Brevo apagado sin activación explícita aunque existan credenciales', () => {
    expect(() => createConfiguredCommercialMailTransport({ ...env, BREVO_ENABLED: undefined }))
      .toThrow('BREVO_DISABLED');
    expect(() => createConfiguredCommercialMailTransport({ ...env, BREVO_ENABLED: 'false' }))
      .toThrow('BREVO_DISABLED');
  });

  it('exige clave y remitente al configurar Brevo', () => {
    expect(() => createConfiguredCommercialMailTransport({ ...env, BREVO_API_KEY: '' }))
      .toThrow('BREVO_API_KEY_REQUIRED');
    expect(() => createConfiguredCommercialMailTransport({
      MAIL_PROVIDER: 'brevo', BREVO_ENABLED: 'true', BREVO_API_KEY: 'unit-test-only', MAIL_FROM: 'marketplace@example.org',
    }))
      .toThrow('BREVO_SENDER_REQUIRED');
  });

  it.each([
    [() => Response.json({ message: 'respuesta privada del proveedor' }, { status: 403 }), 'BREVO_HTTP_403'],
    [() => Response.json({ messageId: 'invalid receipt' }, { status: 201 }), 'BREVO_INVALID_RESPONSE'],
  ])('devuelve un error estable sin reintentar un envío incierto', async (response, code) => {
    const fetchImpl = mockFetch().mockResolvedValue(response());
    const transport = createConfiguredCommercialMailTransport(env, fetchImpl);
    await expect(deliverCommercialMail(order, recipients.PAGADO, config, transport)).rejects.toThrow(code);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
