import { buildOrderDetailUrl, renderOrderConfirmation, renderShipmentUpdate } from './email-template';

describe('C-001 server email renderer', () => {
  const input = {
    orderId: 'PED-2026-00042',
    orderState: 'PAGADO' as const,
    createdAt: '2026-11-04T05:30:00.000Z',
    total: { amount: 125.5, currency: 'PEN' },
    orderDetailUrl: buildOrderDetailUrl('https://market.example', 'PED-2026-00042'),
  };

  it('renders stable semantic HTML and text with a private order link', () => {
    const first = renderOrderConfirmation(input);
    const second = renderOrderConfirmation(input);
    expect(first).toEqual(second);
    expect(first.subject).toContain(input.orderId);
    expect(first.text).toContain(input.orderDetailUrl);
    expect(first.html).toContain('Tu pedido fue confirmado');
    expect(first.html).not.toContain('<script');
  });

  it('rejects a non-paid or malformed snapshot and unsafe origin', () => {
    expect(() => renderOrderConfirmation({ ...input, orderId: 'PED-<script>' })).toThrow();
    expect(() => renderOrderConfirmation({ ...input, orderState: 'CREADO' as 'PAGADO' })).toThrow();
    expect(() => buildOrderDetailUrl('https://market.example?email=private@example.com', input.orderId)).toThrow();
  });

  it('renders C-002 without inventing an estimated date or leaking tracking internals', () => {
    const rendered = renderShipmentUpdate({
      shipmentEventId: 'evt-42',
      orderId: 'PED-2026-00042',
      publicStatus: 'DESPACHADO',
      occurredAt: '2026-11-04T05:30:00.000Z',
      trackingUrl: 'https://market.example/mis-pedidos/PED-2026-00042/seguimiento',
    });
    expect(rendered.payloadVersion).toBe('C-002-v1');
    expect(rendered.subject).toContain('En camino');
    expect(rendered.text).not.toContain('Entrega estimada');
    expect(rendered.html).not.toContain('evt-42');
    expect(rendered.html).not.toContain('trackingNumber');
    expect(() => renderShipmentUpdate({
      shipmentEventId: 'evt-43', orderId: 'PED-2026-00042', publicStatus: 'DESPACHADO',
      occurredAt: 'not-a-date', estimatedDelivery: '2026-02-30',
      trackingUrl: 'https://market.example/mis-pedidos/PED-2026-00042/seguimiento',
    })).toThrow();
  });
});
