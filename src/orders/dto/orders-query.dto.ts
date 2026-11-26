import { ApiError } from '../../http/api-error';
import { ListOrdersQuery, PublishedOrderState } from '../orders.types';

const allowedStates = new Set<PublishedOrderState>([
  'CREADO',
  'PAGADO',
  'EN_PREPARACION',
  'DESPACHADO',
  'ENTREGADO',
  'ANULADO',
]);
const allowedKeys = new Set(['page', 'pageSize', 'state', 'from', 'to']);
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(code: string, message: string): never {
  throw new ApiError(400, code, message);
}

function isCalendarDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function addOneCalendarYear(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const nextYear = year + 1;
  const leap = nextYear % 4 === 0 && (nextYear % 100 !== 0 || nextYear % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const nextDay = Math.min(day, days[month - 1]);
  return `${String(nextYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
}

function optionalScalar(query: Record<string, unknown>, key: string): string | undefined {
  const value = query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') badRequest('FORMATO_INVALIDO', `El parámetro ${key} no tiene el formato esperado.`);
  return value;
}

function parseInteger(value: string | undefined, fallback: number, key: string): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) badRequest('PAGINACION_INVALIDA', `El parámetro ${key} no es válido.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) badRequest('PAGINACION_INVALIDA', `El parámetro ${key} no es válido.`);
  return parsed;
}

/** Validates the public G1 query before any orders provider is called. */
export function parseOrdersQuery(raw: Record<string, unknown>): ListOrdersQuery {
  if (Object.keys(raw).some((key) => !allowedKeys.has(key))) {
    badRequest('PARAMETRO_INVALIDO', 'La consulta contiene un parámetro no admitido.');
  }

  const page = parseInteger(optionalScalar(raw, 'page'), 0, 'page');
  const pageSize = parseInteger(optionalScalar(raw, 'pageSize'), 10, 'pageSize');
  if (pageSize < 1 || pageSize > 50) {
    badRequest('PAGINACION_INVALIDA', 'pageSize debe estar entre 1 y 50.');
  }

  const stateValue = optionalScalar(raw, 'state');
  if (stateValue !== undefined && !allowedStates.has(stateValue as PublishedOrderState)) {
    badRequest('FORMATO_INVALIDO', 'El estado no pertenece al catálogo publicado.');
  }

  const from = optionalScalar(raw, 'from');
  const to = optionalScalar(raw, 'to');
  for (const [key, value] of [['from', from], ['to', to]] as const) {
    if (value !== undefined && !isCalendarDate(value)) {
      badRequest('FORMATO_INVALIDO', `El parámetro ${key} debe usar YYYY-MM-DD.`);
    }
  }
  if (from && to && (from > to || to > addOneCalendarYear(from))) {
    badRequest('RANGO_FECHAS_INVALIDO', 'El rango de fechas debe ser válido y no superar un año.');
  }

  return {
    page,
    pageSize,
    ...(stateValue ? { state: stateValue as PublishedOrderState } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}
