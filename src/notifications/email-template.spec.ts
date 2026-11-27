import { EmailConfiguration, EmailSnapshot, renderTransactionalEmail } from './email-template';

const config: EmailConfiguration = {
  marketplaceOrigin: 'https://marketplace.example.invalid',
  orderUrl: 'https://marketplace.example.invalid/mis-pedidos',
  trackingUrl: 'https://marketplace.example.invalid/mis-pedidos',
  supportUrl: 'https://marketplace.example.invalid/mis-pedidos',
};

const confirmation = {
  type: 'ORDER_CONFIRMATION', orderId: 'PED-DEMO-001', state: 'PAGADO',
  occurredAt: '2026-11-22T18:15:00Z', totalCents: 37980,
  items: [{ name: 'Zapatillas <edición & ruta>', quantity: 1, lineTotalCents: 37980 }],
} as const satisfies EmailSnapshot;

const shipment = {
  type: 'SHIPMENT_UPDATE', orderId: confirmation.orderId, state: 'DESPACHADO',
  occurredAt: confirmation.occurredAt,
} as const satisfies EmailSnapshot;

describe('plantilla comercial F-033', () => {
  it('devuelve HTML y texto consistentes con la versión del renderer y escapa el nombre', () => {
    const message = renderTransactionalEmail(confirmation, config);
    expect(message).toEqual(renderTransactionalEmail(confirmation, config));
    expect(message.payloadVersion).toBe('v1');
    expect(message.html).toContain('&lt;edición &amp; ruta&gt;');
    expect(message.html).not.toContain('<edición');
    expect(message.text).toContain('379.80');
    expect(message.html).toContain('Pago simulado confirmado por Ventas');
    expect(message.text).toContain(config.orderUrl);
  });

  it('rechaza una orden que aún no está pagada', () => {
    const created = { ...confirmation, state: 'CREADO' } as unknown as EmailSnapshot;
    expect(() => renderTransactionalEmail(created, config)).toThrow('EMAIL_ORDER_NOT_PAID');
  });

  it('omite la fecha cuando es desconocida o el envío ya fue entregado', () => {
    const dispatched = renderTransactionalEmail(shipment, config);
    expect(dispatched.subject).toContain('Despachado');
    expect(dispatched.text).not.toContain('Entrega estimada');
    const delivered = renderTransactionalEmail({ ...shipment, state: 'ENTREGADO', estimatedDelivery: '2026-11-22' }, config);
    expect(delivered.html).toContain('Entregado');
    expect(delivered.text).not.toContain('Entrega estimada');
  });

  it('muestra la fecha de entrega estimada y el estado de reprogramación', () => {
    const reprogrammed = renderTransactionalEmail({ ...shipment, state: 'REPROGRAMADO', estimatedDelivery: '2026-11-24' }, config);
    expect(reprogrammed.subject).toContain('Entrega reprogramada');
    expect(reprogrammed.text).toContain('24 de noviembre de 2026');
    expect(reprogrammed.text).toContain(config.trackingUrl);
  });

  it('rechaza URLs con otro origen o parámetros de credenciales', () => {
    for (const orderUrl of ['https://external.example.invalid/mis-pedidos', `${config.orderUrl}?token=fixture`]) {
      expect(() => renderTransactionalEmail(confirmation, { ...config, orderUrl })).toThrow('EMAIL_URL_NOT_ALLOWED');
    }
  });

  it('rechaza fechas de entrega fuera de calendario y un identificador que no es opaco', () => {
    expect(() => renderTransactionalEmail({ ...shipment, estimatedDelivery: '2026-02-31' }, config)).toThrow('EMAIL_DATE_INVALID');
    expect(() => renderTransactionalEmail({ ...shipment, orderId: 'Pedido de Ana' }, config)).toThrow('EMAIL_ORDER_INVALID');
  });
});
