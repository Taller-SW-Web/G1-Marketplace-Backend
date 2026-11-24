export interface ShipmentStatusUpdate {
  shipmentEventId: string;
  orderId: string;
  publicStatus: 'DESPACHADO' | 'ENTREGADO';
  trackingNumber: string;
  occurredAt: string;
  estimatedDelivery?: string;
}

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function isIsoUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 30 || !ISO_UTC_TIMESTAMP.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

/** Validate and minimize the published G5 H-05 webhook. Authentication and delivery are separate gates. */
export function normalizeShipmentStatusWebhook(value: unknown): ShipmentStatusUpdate {
  if (!isRecord(value) || value.eventType !== 'ShipmentStatusUpdated' || value.version !== '1.0.0'
    || value.emitter !== 'modulo-ventas' || typeof value.eventId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.eventId)
    || !isIsoUtcTimestamp(value.timestamp) || !isRecord(value.data)) {
    throw new TypeError('Shipment status event does not match G5 H-05 v1.0.0.');
  }
  const { orderId, publicStatus, trackingNumber, estimatedDeliveryDate } = value.data;
  if (typeof orderId !== 'string' || !/^PED-\d{4}-\d{5}$/.test(orderId)
    || (publicStatus !== 'DESPACHADO' && publicStatus !== 'ENTREGADO')
    || typeof trackingNumber !== 'string' || trackingNumber.length < 1 || trackingNumber.length > 100
    || !(estimatedDeliveryDate === null || isCalendarDate(estimatedDeliveryDate))) {
    throw new TypeError('Shipment status event data is invalid.');
  }
  return {
    shipmentEventId: value.eventId,
    orderId,
    publicStatus,
    trackingNumber,
    occurredAt: new Date(value.timestamp).toISOString(),
    ...(typeof estimatedDeliveryDate === 'string' ? { estimatedDelivery: estimatedDeliveryDate } : {}),
  };
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
