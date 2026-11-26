import {
  calculateSecurityUserEventBackoff,
  readSecurityUserEventRetryCount,
  SecurityUserEventRetryMetadataError,
  securityUserEventRetryQueueName,
} from './security-user-event-reliability';

const SETTINGS = { maxRetries: 3, backoffBaseMs: 1000, backoffMaxMs: 5000 };

describe('security user event retry policy', () => {
  it('uses bounded exponential delays for the configured retry number', () => {
    expect([1, 2, 3, 4].map((retry) => calculateSecurityUserEventBackoff(retry, SETTINGS)))
      .toEqual([1000, 2000, 4000, 5000]);
  });

  it('routes each event type and retry number to a deterministic durable retry queue name', () => {
    expect(securityUserEventRetryQueueName('usuario.creado', 1))
      .toBe('marketplace.usuarios.retry.1.usuario_creado');
    expect(securityUserEventRetryQueueName('usuario.atributos_actualizados', 3))
      .toBe('marketplace.usuarios.retry.3.usuario_atributos_actualizados');
  });

  it('treats an absent retry header as the initial delivery and reads bounded retry metadata', () => {
    expect(readSecurityUserEventRetryCount(undefined, 3)).toBe(0);
    expect(readSecurityUserEventRetryCount({ 'x-marketplace-retry-count': 2 }, 3)).toBe(2);
  });

  it.each([
    { 'x-marketplace-retry-count': '1' },
    { 'x-marketplace-retry-count': -1 },
    { 'x-marketplace-retry-count': 1.5 },
  ])('rejects malformed retry metadata %#', (headers) => {
    expect(() => readSecurityUserEventRetryCount(headers as Record<string, unknown>, 3))
      .toThrow(SecurityUserEventRetryMetadataError);
  });

  it('rejects a retry count above the configured limit', () => {
    expect(() => readSecurityUserEventRetryCount({ 'x-marketplace-retry-count': 4 }, 3))
      .toThrow(SecurityUserEventRetryMetadataError);
  });
});
