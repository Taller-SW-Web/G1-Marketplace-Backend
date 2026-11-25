import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { SecurityUserEventConsumerService } from './security-user-event-consumer.service';
import {
  SecurityUserEventIdentityConflictError,
  SecurityUserEventInboxService,
} from './security-user-event-inbox.service';
import {
  SECURITY_USER_EVENTS_BINDING,
  SECURITY_USER_EVENTS_EXCHANGE,
  SECURITY_USER_EVENTS_EXCHANGE_TYPE,
  SECURITY_USER_EVENTS_QUEUE,
} from './security-user-event';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

const connectMock = amqp.connect as jest.Mock;
const validEvent = {
  eventoId: '22222222-2222-4222-8222-222222222222',
  tipo: 'usuario.creado',
  version: 1,
  fecha: '2026-11-24T12:30:45.123Z',
  usuarioId: '11111111-1111-4111-8111-111111111111',
  datos: { roles: ['CLIENTE'] },
};

type ConsumerPrivateApi = {
  handleMessage(channel: ConfirmChannel, message: ConsumeMessage): Promise<void>;
};

function makeChannel() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const raw = {
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({}),
    bindQueue: jest.fn().mockResolvedValue(undefined),
    prefetch: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue({ consumerTag: 'consumer-test' }),
    cancel: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    ack: jest.fn(),
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
    }),
    sendToQueue: jest.fn((
      _queue: string,
      _content: Buffer,
      _options: Record<string, unknown>,
      callback: (error: Error | null) => void,
    ) => {
      callback(null);
      return true;
    }),
  };
  return { channel: raw as unknown as ConfirmChannel, raw, listeners };
}

function makeConnection(channel: ConfirmChannel) {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const raw = {
    createConfirmChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, listener);
    }),
  };
  return { connection: raw as unknown as ChannelModel, raw, listeners };
}

function makeMessage(
  payload: unknown = validEvent,
  routingKey = 'usuario.creado',
): ConsumeMessage {
  return {
    content: Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
    fields: { routingKey },
    properties: {
      headers: { 'x-trace-id': 'synthetic-trace' },
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      correlationId: 'synthetic-correlation',
      messageId: 'synthetic-message',
    },
  } as unknown as ConsumeMessage;
}

function createHarness(enabled = true) {
  const values: Record<string, unknown> = {
    SECURITY_EVENTS_ENABLED: enabled,
    RABBITMQ_URL: 'amqp://localhost:5672/h5-test',
    SECURITY_EVENTS_DLQ_QUEUE: 'marketplace.usuarios.dlq.test',
    SECURITY_EVENTS_PREFETCH: 3,
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  };
  const inbox = { record: jest.fn() };
  const service = new SecurityUserEventConsumerService(
    config as unknown as ConfigService,
    inbox as unknown as SecurityUserEventInboxService,
  );
  return { service, config, inbox };
}

async function startHarness() {
  const harness = createHarness();
  const { channel, raw: rawChannel } = makeChannel();
  const { connection, raw: rawConnection } = makeConnection(channel);
  connectMock.mockResolvedValue(connection);
  await harness.service.onModuleInit();
  return { ...harness, channel, rawChannel, connection, rawConnection };
}

async function handle(
  service: SecurityUserEventConsumerService,
  channel: ConfirmChannel,
  message: ConsumeMessage,
): Promise<void> {
  return (service as unknown as ConsumerPrivateApi).handleMessage(channel, message);
}

describe('SecurityUserEventConsumerService', () => {
  beforeEach(() => {
    connectMock.mockReset();
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does not connect to RabbitMQ when the feature flag is disabled', async () => {
    const { service } = createHarness(false);

    await service.onModuleInit();

    expect(connectMock).not.toHaveBeenCalled();
  });

  it('declares the durable topology, consumes with manual ack, and closes cleanly', async () => {
    const { service, rawChannel, rawConnection } = await startHarness();

    expect(connectMock).toHaveBeenCalledWith('amqp://localhost:5672/h5-test?heartbeat=30');
    expect(rawChannel.assertExchange).toHaveBeenCalledWith(
      SECURITY_USER_EVENTS_EXCHANGE,
      SECURITY_USER_EVENTS_EXCHANGE_TYPE,
      { durable: true },
    );
    expect(rawChannel.assertQueue).toHaveBeenCalledWith(SECURITY_USER_EVENTS_QUEUE, { durable: true });
    expect(rawChannel.bindQueue).toHaveBeenCalledWith(
      SECURITY_USER_EVENTS_QUEUE,
      SECURITY_USER_EVENTS_EXCHANGE,
      SECURITY_USER_EVENTS_BINDING,
    );
    expect(rawChannel.prefetch).toHaveBeenCalledWith(3);
    expect(rawChannel.consume).toHaveBeenCalledWith(
      SECURITY_USER_EVENTS_QUEUE,
      expect.any(Function),
      { noAck: false },
    );

    await service.onModuleDestroy();

    expect(rawChannel.cancel).toHaveBeenCalledWith('consumer-test');
    expect(rawChannel.close).toHaveBeenCalledTimes(1);
    expect(rawConnection.close).toHaveBeenCalledTimes(1);
  });

  it('fails initialization and closes partially-created resources when topology setup fails', async () => {
    const { service } = createHarness();
    const { channel, raw: rawChannel } = makeChannel();
    const { connection, raw: rawConnection } = makeConnection(channel);
    rawChannel.assertExchange.mockRejectedValue(new Error('broker unavailable'));
    connectMock.mockResolvedValue(connection);

    await expect(service.onModuleInit()).rejects.toThrow(
      'Could not initialize the RabbitMQ user-event consumer',
    );

    expect(rawChannel.close).toHaveBeenCalledTimes(1);
    expect(rawConnection.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['new event', 'recorded'],
    ['duplicate event', 'duplicate'],
  ] as const)('persists and acknowledges a %s', async (_name, result) => {
    const { service, inbox } = createHarness();
    const { channel, raw } = makeChannel();
    inbox.record.mockResolvedValue(result);

    await handle(service, channel, makeMessage());

    expect(inbox.record).toHaveBeenCalledWith(expect.objectContaining({
      eventId: validEvent.eventoId,
      eventType: validEvent.tipo,
      userId: validEvent.usuarioId,
    }));
    expect(raw.ack).toHaveBeenCalledTimes(1);
    expect(raw.sendToQueue).not.toHaveBeenCalled();
  });

  it('acknowledges valid event types it does not yet project', async () => {
    const { service, inbox } = createHarness();
    const { channel, raw } = makeChannel();

    await handle(service, channel, makeMessage({ ...validEvent, tipo: 'usuario.nuevo_evento' }, 'usuario.nuevo_evento'));

    expect(inbox.record).not.toHaveBeenCalled();
    expect(raw.ack).toHaveBeenCalledTimes(1);
    expect(raw.sendToQueue).not.toHaveBeenCalled();
  });

  it('publishes malformed messages to the DLQ before acknowledging them', async () => {
    const { service } = createHarness();
    const { channel, raw } = makeChannel();

    await handle(service, channel, makeMessage('{ malformed json'));

    expect(raw.sendToQueue).toHaveBeenCalledWith(
      'marketplace.usuarios.dlq.test',
      Buffer.from('{ malformed json'),
      expect.objectContaining({
        persistent: true,
        contentType: 'application/json',
        correlationId: 'synthetic-correlation',
        messageId: 'synthetic-message',
        headers: expect.objectContaining({
          'x-trace-id': 'synthetic-trace',
          'x-marketplace-dead-letter-reason': 'invalid_json',
          'x-marketplace-original-routing-key': 'usuario.creado',
        }),
      }),
      expect.any(Function),
    );
    expect(raw.ack).toHaveBeenCalledTimes(1);
  });

  it('routes an event identity conflict to the DLQ with a stable reason', async () => {
    const { service, inbox } = createHarness();
    const { channel, raw } = makeChannel();
    inbox.record.mockRejectedValue(new SecurityUserEventIdentityConflictError());

    await handle(service, channel, makeMessage());

    expect(raw.sendToQueue).toHaveBeenCalledWith(
      'marketplace.usuarios.dlq.test',
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-marketplace-dead-letter-reason': 'event_id_payload_conflict',
        }),
      }),
      expect.any(Function),
    );
    expect(raw.ack).toHaveBeenCalledTimes(1);
  });

  it('forces broker redelivery if DLQ publication cannot be confirmed', async () => {
    const { service, rawChannel, rawConnection, channel } = await startHarness();
    rawChannel.sendToQueue.mockImplementation((
      _queue: string,
      _content: Buffer,
      _options: Record<string, unknown>,
      callback: (error: Error | null) => void,
    ) => {
      callback(new Error('publisher confirm failed'));
      return false;
    });

    await handle(service, channel, makeMessage('{ malformed json'));

    expect(rawChannel.ack).not.toHaveBeenCalled();
    expect(rawChannel.close).toHaveBeenCalledTimes(1);
    expect(rawConnection.close).toHaveBeenCalledTimes(1);
    await service.onModuleDestroy();
  });

  it('schedules reconnect on a broker close and cancels it during shutdown', async () => {
    jest.useFakeTimers();
    const { service, rawConnection } = await startHarness();
    const connectionListeners = rawConnection.on.mock.calls as unknown as Array<
      [string, (...args: unknown[]) => void]
    >;
    const onClose = connectionListeners.find(([event]) => event === 'close')?.[1];

    expect(onClose).toBeDefined();
    onClose?.();
    expect(jest.getTimerCount()).toBe(1);

    await service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
