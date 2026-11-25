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

describe('entrega local de correos comerciales', () => {
  it.each([
    [order, 'Pagado'],
    [{ ...shipment, state: 'DESPACHADO' }, 'Despachado'],
    [{ ...shipment, state: 'ENTREGADO' }, 'Entregado'],
  ] as const)('entrega HTML y texto plano para %j', async (snapshot, expectedState) => {
    const fetchImpl = mockFetch().mockResolvedValue(Response.json({ ID: 'qa-message-1' }));
    const transport = createConfiguredCommercialMailTransport(env, fetchImpl);
    await expect(deliverCommercialMail(snapshot, to, config, transport)).resolves.toEqual({
      status: 'accepted', messageId: 'qa-message-1', payloadVersion: 'v1',
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
    for (const state of ['ASIGNADO', 'EN_CAMINO', 'REPROGRAMADO', 'INCIDENCIA'] as const) {
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
