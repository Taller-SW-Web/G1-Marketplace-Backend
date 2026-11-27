export interface ShipmentStatusUpdatedEvent {
  eventId: string;
  eventType: 'ShipmentStatusUpdated';
  version: '1.0.0';
  timestamp: string;
  emitter: 'modulo-ventas';
  data: {
    orderId: string;
    publicStatus: string;
    trackingNumber: string;
    estimatedDeliveryDate: string | null;
  };
}

export type ShipmentEventAcceptResult = 'accepted' | 'duplicate';

/** Durable implementations persist the event and deduplicate atomically by eventId. */
export interface ShipmentEventSink {
  accept(event: ShipmentStatusUpdatedEvent): Promise<ShipmentEventAcceptResult>;
}

export const SHIPMENT_EVENT_SINK = Symbol('SHIPMENT_EVENT_SINK');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseShipmentStatusUpdatedEvent(value: unknown): ShipmentStatusUpdatedEvent | null {
  if (!isRecord(value) || value.eventType !== 'ShipmentStatusUpdated' || value.version !== '1.0.0' ||
      typeof value.eventId !== 'string' || !UUID_PATTERN.test(value.eventId) || !isIsoDateTime(value.timestamp) ||
      value.emitter !== 'modulo-ventas' ||
      !isRecord(value.data)) return null;

  const data = value.data;
  if (typeof data.orderId !== 'string' || !/^PED-\d{4}-\d{5}$/u.test(data.orderId) ||
      !isBoundedText(data.publicStatus, 64)) return null;
  if (!isBoundedText(data.trackingNumber, 128) ||
      !(data.estimatedDeliveryDate === null || isIsoDate(data.estimatedDeliveryDate))) return null;

  return {
    eventId: value.eventId.toLowerCase(),
    eventType: 'ShipmentStatusUpdated',
    version: '1.0.0',
    timestamp: value.timestamp,
    emitter: 'modulo-ventas',
    data: {
      orderId: data.orderId,
      publicStatus: data.publicStatus,
      trackingNumber: data.trackingNumber,
      estimatedDeliveryDate: data.estimatedDeliveryDate,
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
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);

  return isCalendarDate(year, month, day) && hour <= 23 && minute <= 59 && second <= 59 &&
    offsetHour <= 14 && offsetMinute <= 59 && (offsetHour < 14 || offsetMinute === 0) &&
    !Number.isNaN(Date.parse(value));
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return isCalendarDate(year, month, day);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}
