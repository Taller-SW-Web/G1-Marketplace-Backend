import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as amqp from 'amqplib';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SecurityEventsModule } from '../src/security-events/security-events.module';
import { SecurityUserEventConsumerService } from '../src/security-events/security-user-event-consumer.service';
import { SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

function buildRawEvent(eventoId: string, tipo: string, usuarioId: string) {
  return Buffer.from(JSON.stringify({
    eventoId,
    tipo,
    version: 1,
    fecha: '2026-11-26T15:30:00.000Z',
    usuarioId,
    datos: tipo === 'usuario.bloqueado' ? { automatico: false, hasta: null } : { roles: ['CLIENTE'] },
  }));
}

const postgresSuite = process.env.H3_ALLOW_TEST_DATABASE_WRITES === 'true' ? describe : describe.skip;

postgresSuite('Security user event consumer recovery PostgreSQL 16 integration (BE #317)', () => {
  let prisma: PrismaService;
  let consumer: SecurityUserEventConsumerService;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

  const evt1 = '11111111-1111-4111-8111-111111111117';
  const evt2 = '22222222-2222-4222-8222-222222222217';
  const evt3 = '33333333-3333-4333-8333-333333333317';
  const userA = SANDBOX_CUSTOMERS.A;
  const userB = SANDBOX_CUSTOMERS.B;

  const durableQueue: Array<{
    content: Buffer;
    fields: { routingKey: string };
    properties: { correlationId?: string; headers: Record<string, unknown> };
  }> = [];
  const chanCloseCallbacks: Array<() => void> = [];
  let activeHandler: ((msg: unknown) => void) | undefined;

  function makeChannel() {
    return {
      assertExchange: jest.fn(async () => ({})),
      assertQueue: jest.fn(async () => ({})),
      bindQueue: jest.fn(async () => ({})),
      prefetch: jest.fn(async () => ({})),
      on: jest.fn((ev: string, cb: () => void) => {
        if (ev === 'close') chanCloseCallbacks.push(cb);
      }),
      consume: jest.fn(async (_q: string, onMsg: (msg: unknown) => void) => {
        activeHandler = onMsg;
        while (durableQueue.length > 0) {
          onMsg(durableQueue.shift()!);
        }
        return { consumerTag: `ctag-${Date.now()}` };
      }),
      ack: jest.fn(),
      nack: jest.fn(),
      cancel: jest.fn(async () => ({})),
      close: jest.fn(async () => ({})),
    };
  }

  function makeConnection(chan: ReturnType<typeof makeChannel>) {
    return {
      createConfirmChannel: jest.fn(async () => chan),
      on: jest.fn(),
      close: jest.fn(async () => ({})),
    };
  }

  beforeAll(async () => {
    const chan1 = makeChannel();
    const chan2 = makeChannel();
    (amqp.connect as jest.Mock)
      .mockResolvedValueOnce(makeConnection(chan1))
      .mockResolvedValueOnce(makeConnection(chan2));

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({
            NODE_ENV: 'test',
            SECURITY_EVENTS_ENABLED: true,
            RABBITMQ_URL: 'amqp://user:pass@localhost:5672',
            SECURITY_EVENTS_PREFETCH: 1,
            SECURITY_EVENTS_MAX_RETRIES: 3,
            SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
            SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
          })],
        }),
        PrismaModule,
        SecurityEventsModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    consumer = moduleRef.get(SecurityUserEventConsumerService);
    await prisma.securityUserEventInbox.deleteMany({ where: { eventId: { in: [evt1, evt2, evt3] } } });
    await prisma.securityUserState.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.wishlistItem.deleteMany({ where: { customerId: { in: [userA, userB] } } });
    await prisma.wishlistItem.create({ data: { customerId: userA, productId: 'prod-recovery-a' } });
    await prisma.wishlistItem.create({ data: { customerId: userB, productId: 'prod-recovery-b' } });
  });

  afterAll(async () => {
    await consumer?.onModuleDestroy();
    await prisma?.securityUserEventInbox.deleteMany({ where: { eventId: { in: [evt1, evt2, evt3] } } });
    await prisma?.securityUserState.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma?.wishlistItem.deleteMany({ where: { customerId: { in: [userA, userB] } } });
    await moduleRef?.close();
  });

  it('reconnects automatically after downtime, drains pending messages into PostgreSQL once per eventId, and preserves correlationId', async () => {
    const logSpy = jest.spyOn((consumer as unknown as { logger: { log: (m: string) => void } }).logger, 'log');
    await consumer.onModuleInit();

    // 1. Process evt1 while connected
    activeHandler!({
      content: buildRawEvent(evt1, 'usuario.bloqueado', userA),
      fields: { routingKey: 'usuario.bloqueado' },
      properties: { correlationId: 'corr-pg-001', headers: {} },
    });
    await new Promise((r) => setTimeout(r, 150));

    expect(consumer.getMetrics().processedTotal).toBe(1);
    expect(await prisma.wishlistItem.count({ where: { customerId: userA } })).toBe(0);

    // 2. Simulate consumer downtime; 3 messages accumulate (including duplicate evt1)
    activeHandler = undefined;
    durableQueue.push(
      {
        content: buildRawEvent(evt1, 'usuario.bloqueado', userA),
        fields: { routingKey: 'usuario.bloqueado' },
        properties: { correlationId: 'corr-pg-001-redelivery', headers: {} },
      },
      {
        content: buildRawEvent(evt2, 'usuario.roles_cambiados', userA),
        fields: { routingKey: 'usuario.roles_cambiados' },
        properties: { correlationId: 'corr-pg-002', headers: {} },
      },
      {
        content: buildRawEvent(evt3, 'usuario.bloqueado', userB),
        fields: { routingKey: 'usuario.bloqueado' },
        properties: { headers: { 'x-correlation-id': 'corr-pg-003' } },
      },
    );
    chanCloseCallbacks.forEach((cb) => cb());

    // 3. Wait for automatic reconnect timer (1000ms) + drain into PostgreSQL
    await new Promise((r) => setTimeout(r, 1400));

    const metrics = consumer.getMetrics();
    expect(metrics.reconnectsTotal).toBe(1);
    expect(metrics.processedTotal).toBe(3);
    expect(metrics.duplicateTotal).toBe(1);

    // PostgreSQL recorded each eventId exactly once and purged User B without unblocking User A
    expect(await prisma.securityUserEventInbox.count({ where: { eventId: { in: [evt1, evt2, evt3] } } })).toBe(3);
    expect(await prisma.wishlistItem.count({ where: { customerId: userB } })).toBe(0);
    expect((await prisma.securityUserState.findUnique({ where: { userId: userA } }))?.status).toBe('BLOCKED');
    expect((await prisma.securityUserState.findUnique({ where: { userId: userB } }))?.status).toBe('BLOCKED');

    const logs = logSpy.mock.calls.map((c) => c[0]).filter((s) => s.startsWith('{'));
    expect(logs.some((l) => l.includes('"correlationId":"corr-pg-001"'))).toBe(true);
    expect(logs.some((l) => l.includes('"correlationId":"corr-pg-002"'))).toBe(true);
    expect(logs.some((l) => l.includes('"correlationId":"corr-pg-003"'))).toBe(true);
  });
});
