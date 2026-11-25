import { createHash } from 'node:crypto';

export const SECURITY_USER_EVENTS_EXCHANGE = 'seguridad.usuarios';
export const SECURITY_USER_EVENTS_EXCHANGE_TYPE = 'topic';
export const SECURITY_USER_EVENTS_QUEUE = 'marketplace.usuarios';
export const SECURITY_USER_EVENTS_BINDING = 'usuario.*';

export const SECURITY_USER_EVENT_TYPES = [
  'usuario.creado',
  'usuario.desactivado',
  'usuario.reactivado',
  'usuario.bloqueado',
  'usuario.desbloqueado',
  'usuario.roles_cambiados',
  'usuario.atributos_actualizados',
] as const;

export type SecurityUserEventType = (typeof SECURITY_USER_EVENT_TYPES)[number];

export interface SecurityUserEvent {
  eventId: string;
  eventType: SecurityUserEventType;
  version: 1;
  occurredAt: string;
  userId: string;
  data: Record<string, unknown>;
  payloadSha256: string;
}

export type SecurityUserEventParseResult =
  | { kind: 'known'; event: SecurityUserEvent }
  | { kind: 'unknown'; eventType: string };

export class SecurityUserEventValidationError extends Error {
  constructor(readonly reasonCode: string) {
    super(reasonCode);
    this.name = 'SecurityUserEventValidationError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPE_PATTERN = /^usuario\.[a-z][a-z0-9_]{0,80}$/;
const UTC_MILLISECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ROLE_PATTERN = /^[A-Z][A-Z0-9_]{0,49}$/;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown, pattern?: RegExp): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string'
    && item.length > 0 && (!pattern || pattern.test(item)));
}

function validUtcTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !UTC_MILLISECONDS_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function validEventData(eventType: SecurityUserEventType, data: JsonObject): boolean {
  switch (eventType) {
    case 'usuario.creado':
    case 'usuario.reactivado':
    case 'usuario.roles_cambiados':
      return isStringArray(data.roles, ROLE_PATTERN);
    case 'usuario.desactivado':
      return isNonEmptyString(data.motivo);
    case 'usuario.bloqueado':
      return typeof data.automatico === 'boolean'
        && (data.hasta === null || validUtcTimestamp(data.hasta));
    case 'usuario.desbloqueado':
      return ['ADMINISTRADOR', 'ENLACE', 'RESTABLECIMIENTO'].includes(String(data.via));
    case 'usuario.atributos_actualizados':
      return isStringArray(data.campos, /^[a-z][a-zA-Z0-9_]{0,49}$/);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function parseSecurityUserEvent(
  input: Buffer | string,
  routingKey: string,
): SecurityUserEventParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(typeof input === 'string' ? input : input.toString('utf8')) as unknown;
  } catch {
    throw new SecurityUserEventValidationError('invalid_json');
  }
  if (!isObject(raw)) throw new SecurityUserEventValidationError('invalid_envelope');

  const eventId = raw.eventoId;
  const eventType = raw.tipo;
  const version = raw.version;
  const occurredAt = raw.fecha;
  const userId = raw.usuarioId;
  const data = raw.datos;

  if (typeof eventId !== 'string' || !UUID_PATTERN.test(eventId)) {
    throw new SecurityUserEventValidationError('invalid_event_id');
  }
  if (typeof eventType !== 'string' || !EVENT_TYPE_PATTERN.test(eventType) || eventType !== routingKey) {
    throw new SecurityUserEventValidationError('event_type_routing_key_mismatch');
  }
  if (!Number.isInteger(version) || Number(version) < 1) {
    throw new SecurityUserEventValidationError('invalid_schema_version');
  }
  if (!validUtcTimestamp(occurredAt)) throw new SecurityUserEventValidationError('invalid_event_timestamp');
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new SecurityUserEventValidationError('invalid_user_id');
  }
  if (!isObject(data)) throw new SecurityUserEventValidationError('invalid_event_data');

  if (!(SECURITY_USER_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return { kind: 'unknown', eventType };
  }
  if (version !== 1) throw new SecurityUserEventValidationError('unsupported_schema_version');

  const knownType = eventType as SecurityUserEventType;
  if (!validEventData(knownType, data)) {
    throw new SecurityUserEventValidationError('invalid_event_data');
  }

  return {
    kind: 'known',
    event: {
      eventId,
      eventType: knownType,
      version: 1,
      occurredAt,
      userId,
      data,
      payloadSha256: createHash('sha256').update(stableJson(raw)).digest('hex'),
    },
  };
}
