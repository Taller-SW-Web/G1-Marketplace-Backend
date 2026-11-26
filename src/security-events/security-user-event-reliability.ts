import { SECURITY_USER_EVENTS_QUEUE, SecurityUserEventType } from './security-user-event';

export const SECURITY_USER_EVENT_RETRY_COUNT_HEADER = 'x-marketplace-retry-count';

export interface SecurityUserEventRetrySettings {
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export class SecurityUserEventRetryMetadataError extends Error {
  constructor() {
    super('invalid_retry_count');
    this.name = 'SecurityUserEventRetryMetadataError';
  }
}

export function calculateSecurityUserEventBackoff(
  retryNumber: number,
  settings: SecurityUserEventRetrySettings,
): number {
  if (!Number.isInteger(retryNumber) || retryNumber < 1) {
    throw new RangeError('retryNumber must be a positive integer');
  }
  const exponent = Math.min(retryNumber - 1, 30);
  return Math.min(settings.backoffBaseMs * (2 ** exponent), settings.backoffMaxMs);
}

export function securityUserEventRetryQueueName(
  eventType: SecurityUserEventType,
  retryNumber: number,
): string {
  return `${SECURITY_USER_EVENTS_QUEUE}.retry.${retryNumber}.${eventType.replace('.', '_')}`;
}

export function readSecurityUserEventRetryCount(
  headers: Record<string, unknown> | undefined,
  maxRetries: number,
): number {
  const value = headers?.[SECURITY_USER_EVENT_RETRY_COUNT_HEADER];
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maxRetries) {
    throw new SecurityUserEventRetryMetadataError();
  }
  return value;
}
