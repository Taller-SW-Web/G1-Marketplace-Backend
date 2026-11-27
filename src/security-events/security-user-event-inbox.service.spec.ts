import { PrismaService } from '../prisma/prisma.service';
import {
  SecurityUserEventIdentityConflictError,
  SecurityUserEventInboxService,
} from './security-user-event-inbox.service';
import { parseSecurityUserEvent } from './security-user-event';

const EVENT = parseSecurityUserEvent(JSON.stringify({
  eventoId: '22222222-2222-4222-8222-222222222222',
  tipo: 'usuario.creado',
  version: 1,
  fecha: '2026-11-24T12:30:45.123Z',
  usuarioId: '11111111-1111-4111-8111-111111111111',
  datos: { roles: ['CLIENTE'] },
}), 'usuario.creado');

describe('SecurityUserEventInboxService', () => {
  const queryRaw = jest.fn();
  const findUnique = jest.fn();
  let service: SecurityUserEventInboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecurityUserEventInboxService({
      $queryRaw: queryRaw,
      securityUserEventInbox: { findUnique },
    } as unknown as PrismaService);
  });

  it('records only event metadata and a fingerprint, not the source payload', async () => {
    queryRaw.mockResolvedValue([{ event_id: '22222222-2222-4222-8222-222222222222' }]);
    if (EVENT.kind !== 'known') throw new Error('fixture must be a known event');

    await expect(service.record(EVENT.event)).resolves.toBe('recorded');
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('treats the same event id and payload as an idempotent duplicate without aborting tx', async () => {
    queryRaw.mockResolvedValue([]);
    if (EVENT.kind !== 'known') throw new Error('fixture must be a known event');
    findUnique.mockResolvedValue({
      eventType: EVENT.event.eventType,
      eventVersion: EVENT.event.version,
      payloadSha256: EVENT.event.payloadSha256,
    });

    await expect(service.record(EVENT.event)).resolves.toBe('duplicate');
  });

  it('rejects reuse of an event id with different content', async () => {
    queryRaw.mockResolvedValue([]);
    if (EVENT.kind !== 'known') throw new Error('fixture must be a known event');
    findUnique.mockResolvedValue({
      eventType: EVENT.event.eventType,
      eventVersion: EVENT.event.version,
      payloadSha256: '0'.repeat(64),
    });

    await expect(service.record(EVENT.event)).rejects.toBeInstanceOf(SecurityUserEventIdentityConflictError);
  });

  it('propagates persistence failures for the consumer reliability policy', async () => {
    queryRaw.mockRejectedValue(new Error('database unavailable'));
    if (EVENT.kind !== 'known') throw new Error('fixture must be a known event');

    await expect(service.record(EVENT.event)).rejects.toThrow('database unavailable');
  });
});
