export interface ShipmentStatusUpdatedEvent {
  eventId: string;
  eventType: 'ShipmentStatusUpdated';
  version: '1.0.0';
  timestamp: string;
  emitter: string;
  data: {
    orderId: string;
    publicStatus: string;
    trackingNumber?: string;
    estimatedDeliveryDate?: string | null;
  };
}

export type ShipmentEventAcceptResult = 'accepted' | 'duplicate';

/** Durable implementations persist the event and deduplicate atomically by eventId. */
export interface ShipmentEventSink {
  accept(event: ShipmentStatusUpdatedEvent): Promise<ShipmentEventAcceptResult>;
}

export const SHIPMENT_EVENT_SINK = Symbol('SHIPMENT_EVENT_SINK');

export function parseShipmentStatusUpdatedEvent(value: unknown): ShipmentStatusUpdatedEvent | null {
  if (!isRecord(value) || value.eventType !== 'ShipmentStatusUpdated' || value.version !== '1.0.0' ||
      !isBoundedText(value.eventId, 255) || !isIsoDateTime(value.timestamp) || !isBoundedText(value.emitter, 128) ||
      !isRecord(value.data)) return null;

  const data = value.data;
  if (typeof data.orderId !== 'string' || !/^PED-\d{4}-\d{5}$/u.test(data.orderId) ||
      !isBoundedText(data.publicStatus, 64)) return null;
  if (data.trackingNumber !== undefined && !isBoundedText(data.trackingNumber, 128)) return null;
  if (data.estimatedDeliveryDate !== undefined && data.estimatedDeliveryDate !== null &&
      !isIsoDate(data.estimatedDeliveryDate)) return null;

  return {
    eventId: value.eventId,
    eventType: 'ShipmentStatusUpdated',
    version: '1.0.0',
    timestamp: value.timestamp,
    emitter: value.emitter,
    data: {
      orderId: data.orderId,
      publicStatus: data.publicStatus,
      ...(data.trackingNumber !== undefined ? { trackingNumber: data.trackingNumber } : {}),
      ...(data.estimatedDeliveryDate !== undefined ? { estimatedDeliveryDate: data.estimatedDeliveryDate } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && value === value.trim();
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
