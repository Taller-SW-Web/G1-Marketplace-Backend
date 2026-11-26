import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { SecurityUserEventInboxService } from './security-user-event-inbox.service';
import { SecurityUserEventConsumerService } from './security-user-event-consumer.service';
import { SecurityUserReactionService } from './security-user-reaction.service';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

function buildRawEvent(eventoId: string, tipo: string, usuarioId: string) {
  return Buffer.from(JSON.stringify({
    eventoId,
    tipo,
    version: 1,
    fecha: '2026-11-26T15:00:00.000Z',
    usuarioId,
    datos: tipo === 'usuario.bloqueado' ? { automatico: false, hasta: null } : { roles: ['CLIENTE'] },
  }));
}

describe('SecurityUserEventConsumerService resilience & correlation (BE #317)', () => {
  const seenEvents = new Set<string>();
  const appliedSideEffects: string[] = [];

  const reactions = {
    handleEvent: jest.fn(async (event: { eventId: string; eventType: string }) => {
      if (seenEvents.has(event.eventId)) return 'duplicate' as const;
      seenEvents.add(event.eventId);
      appliedSideEffects.push(`${event.eventId}:${event.eventType}`);
      return 'recorded' as const;
    }),
  } as unknown as SecurityUserReactionService;

  const inbox = {
    record: jest.fn(),
  } as unknown as SecurityUserEventInboxService;

  const config = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const map: Record<string, unknown> = {
        SECURITY_EVENTS_ENABLED: true,
        RABBITMQ_URL: 'amqp://user:pass@localhost:5672',
        SECURITY_EVENTS_PREFETCH: 1,
        SECURITY_EVENTS_MAX_RETRIES: 3,
        SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
        SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
      };
      return key in map ? map[key] : defaultValue;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    seenEvents.clear();
    appliedSideEffects.length = 0;
  });

  it('recovers queued messages after consumer downtime without duplicate side effects and tracks correlation/metrics', async () => {
    const durableQueue: Array<{ content: Buffer; fields: { routingKey: string }; properties: { correlationId?: string; headers: Record<string, unknown> } }> = [];
    let activeHandler: ((msg: unknown) => void) | undefined;
    let closeHandlers: Record<string, (() => void)[]> = { conn: [], chan: [] };
    const acked: unknown[] = [];

    const makeChannel = () => ({
      assertExchange: jest.fn(async () => ({})),
      assertQueue: jest.fn(async () => ({})),
      bindQueue: jest.fn(async () => ({})),
      prefetch: jest.fn(async () => ({})),
      on: jest.fn((ev: string, cb: () => void) => {
        if (ev === 'close') closeHandlers.chan.push(cb);
      }),
      consume: jest.fn(async (_q: string, onMsg: (msg: unknown) => void) => {
        activeHandler = onMsg;
        // Drain any messages accumulated while consumer was offline
        while (durableQueue.length > 0) {
          onMsg(durableQueue.shift()!);
        }
        return { consumerTag: 'ctag-1' };
      }),
      ack: jest.fn((msg: unknown) => acked.push(msg)),
      nack: jest.fn(),
      cancel: jest.fn(async () => ({})),
      close: jest.fn(async () => ({})),
    });

    const makeConnection = (chan: ReturnType<typeof makeChannel>) => ({
      createConfirmChannel: jest.fn(async () => chan),
      on: jest.fn((ev: string, cb: () => void) => {
        if (ev === 'close') closeHandlers.conn.push(cb);
      }),
      close: jest.fn(async () => ({})),
    });

    const chan1 = makeChannel();
    const conn1 = makeConnection(chan1);
    const chan2 = makeChannel();
    const conn2 = makeConnection(chan2);

    (amqp.connect as jest.Mock)
      .mockResolvedValueOnce(conn1)
      .mockResolvedValueOnce(conn2);

    const consumer = new SecurityUserEventConsumerService(config, inbox, reactions);
    const logSpy = jest.spyOn((consumer as unknown as { logger: { log: (m: string) => void } }).logger, 'log');

    await consumer.onModuleInit();

    // 1. Initial event arrives and is processed
    const evt1 = '11111111-1111-4111-8111-111111111111';
    const user1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    activeHandler!({
      content: buildRawEvent(evt1, 'usuario.bloqueado', user1),
      fields: { routingKey: 'usuario.bloqueado' },
      properties: { correlationId: 'corr-001', headers: {} },
    });
    await new Promise((r) => setImmediate(r));

    expect(consumer.getMetrics().processedTotal).toBe(1);
    expect(appliedSideEffects).toHaveLength(1);

    // 2. Simulate consumer downtime (channel/connection drop)
    activeHandler = undefined;
    closeHandlers.chan.forEach((cb) => cb());

    // 3. Messages accumulate in durable queue while consumer is down (including duplicate evt1!)
    const evt2 = '22222222-2222-4222-8222-222222222222';
    const evt3 = '33333333-3333-4333-8333-333333333333';
    durableQueue.push(
      {
        content: buildRawEvent(evt1, 'usuario.bloqueado', user1),
        fields: { routingKey: 'usuario.bloqueado' },
        properties: { correlationId: 'corr-001-redelivery', headers: {} },
      },
      {
        content: buildRawEvent(evt2, 'usuario.roles_cambiados', user1),
        fields: { routingKey: 'usuario.roles_cambiados' },
        properties: { correlationId: 'corr-002', headers: {} },
      },
      {
        content: buildRawEvent(evt3, 'usuario.bloqueado', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        fields: { routingKey: 'usuario.bloqueado' },
        properties: { headers: { 'x-correlation-id': 'corr-003' } },
      },
    );

    // 4. Trigger reconnect and drain backlog
    await (consumer as unknown as { connectAndConsume: (r: boolean) => Promise<void> }).connectAndConsume(true);
    await new Promise((r) => setImmediate(r));

    const metrics = consumer.getMetrics();
    expect(metrics.reconnectsTotal).toBe(1);
    expect(metrics.processedTotal).toBe(3);
    expect(metrics.duplicateTotal).toBe(1);
    expect(appliedSideEffects).toEqual([
      `${evt1}:usuario.bloqueado`,
      `${evt2}:usuario.roles_cambiados`,
      `${evt3}:usuario.bloqueado`,
    ]);

    const structuredLogs = logSpy.mock.calls.map((c) => c[0]).filter((s) => s.startsWith('{'));
    expect(structuredLogs.some((line) => line.includes('"correlationId":"corr-001"'))).toBe(true);
    expect(structuredLogs.some((line) => line.includes('"correlationId":"corr-002"'))).toBe(true);
    expect(structuredLogs.some((line) => line.includes('"correlationId":"corr-003"'))).toBe(true);
    expect(structuredLogs.some((line) => line.includes('"event":"security_user_consumer_reconnected"'))).toBe(true);

    await consumer.onModuleDestroy();
  });
});
