import { mapG6Availability } from './g6-availability.mapper';
import { isProductAvailabilityResponse } from './product-availability.dto';

const context = { productId: 'PRD-1', sku: 'SKU-1', checkedAt: '2026-11-03T19:38:18Z' };
const item = { sku: 'SKU-1', status: 'INDETERMINADO' };

describe('F-014: frontera de inventario, sin saldos ni inferencias', () => {
  it.each([
    null, {}, { code: 'SERVICIO_NO_DISPONIBLE', status: 503 }, { items: [] },
    { items: [item, item] }, { items: [{ ...item, sku: 'SKU-OTRO' }] },
    { items: [{ ...item, status: 'ESTADO_NUEVO' }] },
    { items: [{ ...item, status: '__proto__' }] },
    { items: [{ ...item, status: 'UNDETERMINED' }] },
  ])('rechaza respuesta ausente, ambigua o ajena al contrato: %j', (payload) => {
    expect(() => mapG6Availability(payload, context)).toThrow();
    try { mapG6Availability(payload, context); } catch (error) {
      expect(error).toMatchObject({ status: 502, response: { error: { code: 'INVENTORY_INVALID_RESPONSE' } } });
    }
  });

  it.each(['quantity', 'available', 'onHand', 'on_hand', 'reserved', 'blocked', 'locationId', 'location_id', 'reason'])
  ('no acepta ni publica el campo interno/no contratado %s', (key) => {
    expect(() => mapG6Availability({ items: [{ ...item, [key]: 12 }] }, context)).toThrow();
    const response = mapG6Availability({ items: [item] }, context);
    expect(isProductAvailabilityResponse({ data: { ...response.data, [key]: 12 } })).toBe(false);
  });

  it('rechaza contexto inválido sin convertirlo en una decisión de stock', () => {
    expect(() => mapG6Availability({ items: [item] }, { ...context, checkedAt: 'invalid' })).toThrow();
    expect(() => mapG6Availability({ items: [item] }, { ...context, productId: '' })).toThrow();
  });
});
