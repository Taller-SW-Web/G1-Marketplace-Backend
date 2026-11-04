import { normalizeShipmentStatusWebhook } from './shipment-event';

describe('normalizeShipmentStatusWebhook', () => {
  const fixture = {
    eventId: 'evt_fixture_0001',
    eventType: 'ShipmentStatusUpdated',
    version: '1.0.0',
    timestamp: '2026-11-03T21:40:00Z',
    emitter: 'modulo-ventas',
    data: {
      orderId: 'PED-2026-00981',
      publicStatus: 'DESPACHADO',
      trackingNumber: 'DESP-00412',
      estimatedDeliveryDate: '2026-11-06',
      privateField: 'must not be copied',
    },
  };

  it('maps only the public H-05 fields and preserves the textual order ID', () => {
    expect(normalizeShipmentStatusWebhook(fixture)).toEqual({
      shipmentEventId: 'evt_fixture_0001',
      orderId: 'PED-2026-00981',
      publicStatus: 'DESPACHADO',
      trackingNumber: 'DESP-00412',
      occurredAt: '2026-11-03T21:40:00.000Z',
      estimatedDelivery: '2026-11-06',
    });
  });

  it('rejects unknown versions, event types, and public statuses', () => {
    expect(() => normalizeShipmentStatusWebhook({ ...fixture, version: '2.0.0' })).toThrow(TypeError);
    expect(() => normalizeShipmentStatusWebhook({ ...fixture, eventType: 'OrderPaid' })).toThrow(TypeError);
    expect(() => normalizeShipmentStatusWebhook({ ...fixture, data: { ...fixture.data, publicStatus: 'EN_PREPARACION' } })).toThrow(TypeError);
  });

  it('rejects a malformed order ID and non-calendar estimated date', () => {
    expect(() => normalizeShipmentStatusWebhook({ ...fixture, data: { ...fixture.data, orderId: '981' } })).toThrow(TypeError);
    expect(() => normalizeShipmentStatusWebhook({ ...fixture, data: { ...fixture.data, estimatedDeliveryDate: '2026-02-30' } })).toThrow(TypeError);
  });
});
