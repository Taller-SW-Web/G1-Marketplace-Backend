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
  SECURITY_USER_EVENTS_DEAD_LETTER_EXCHANGE,
  SECURITY_USER_EVENTS_DEAD_LETTER_ROUTING_KEY,
  SECURITY_USER_EVENTS_EXCHANGE,
  SECURITY_USER_EVENTS_EXCHANGE_TYPE,
  SECURITY_USER_EVENTS_QUEUE,
  SECURITY_USER_EVENT_TYPES,
} from './security-user-event';
import { securityUserEventRetryQueueName } from './security-user-event-reliability';

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
  assertRetryQueues(channel: ConfirmChannel): Promise<void>;
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
    nack: jest.fn(),
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
    SECURITY_EVENTS_PREFETCH: 3,
    SECURITY_EVENTS_MAX_RETRIES: 3,
    SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
    SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
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
    expect(rawChannel.assertQueue).toHaveBeenCalledWith(SECURITY_USER_EVENTS_QUEUE, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': SECURITY_USER_EVENTS_DEAD_LETTER_EXCHANGE,
        'x-dead-letter-routing-key': SECURITY_USER_EVENTS_DEAD_LETTER_ROUTING_KEY,
      },
    });
    expect(rawChannel.assertQueue).toHaveBeenCalledTimes(1 + SECURITY_USER_EVENT_TYPES.length * 3);
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
    expect(raw.nack).not.toHaveBeenCalled();
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

  it('rejects malformed messages so RabbitMQ routes them through the queue DLX', async () => {
    const { service } = createHarness();
    const { channel, raw } = makeChannel();

    await handle(service, channel, makeMessage('{ malformed json'));

    expect(raw.nack).toHaveBeenCalledWith(expect.objectContaining({ content: Buffer.from('{ malformed json') }), false, false);
    expect(raw.ack).not.toHaveBeenCalled();
    expect(raw.sendToQueue).not.toHaveBeenCalled();
  });

  it('routes an event identity conflict through the queue DLX without publishing to a queue directly', async () => {
    const { service, inbox } = createHarness();
    const { channel, raw } = makeChannel();
    inbox.record.mockRejectedValue(new SecurityUserEventIdentityConflictError());

    await handle(service, channel, makeMessage());

    expect(raw.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    expect(raw.ack).not.toHaveBeenCalled();
    expect(raw.sendToQueue).not.toHaveBeenCalled();
    expect(inbox.record).toHaveBeenCalledTimes(1);
  });

  it('publishes a transient inbox failure to the first durable retry queue before acknowledging the source', async () => {
    const { service, inbox } = createHarness();
    const { channel, raw } = makeChannel();
    inbox.record.mockRejectedValue(new Error('temporary database outage'));

    await handle(service, channel, makeMessage());

    expect(raw.sendToQueue).toHaveBeenCalledWith(
      securityUserEventRetryQueueName('usuario.creado', 1),
      expect.any(Buffer),
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({
          'x-marketplace-retry-count': 1,
          'x-marketplace-last-error': 'inbox_persistence_failure',
        }),
      }),
      expect.any(Function),
    );
    expect(raw.ack).toHaveBeenCalledTimes(1);
    expect(raw.nack).not.toHaveBeenCalled();
  });

  it('declares one durable TTL/DLX retry queue per event type and retry number', async () => {
    const { service } = createHarness();
    const { channel, raw } = makeChannel();

    await (service as unknown as ConsumerPrivateApi).assertRetryQueues(channel);

    expect(raw.assertQueue).toHaveBeenCalledTimes(SECURITY_USER_EVENT_TYPES.length * 3);
    expect(raw.assertQueue).toHaveBeenNthCalledWith(1,
      'marketplace.usuarios.retry.1.usuario_creado', {
        durable: true,
        arguments: {
          'x-message-ttl': 1000,
          'x-dead-letter-exchange': SECURITY_USER_EVENTS_EXCHANGE,
          'x-dead-letter-routing-key': 'usuario.creado',
        },
      });
    expect(raw.assertQueue).toHaveBeenNthCalledWith(3,
      'marketplace.usuarios.retry.3.usuario_creado', expect.objectContaining({
        arguments: expect.objectContaining({ 'x-message-ttl': 4000 }),
      }));
  });

  it('routes the event through the configured DLX after all three retries are exhausted', async () => {
    const { service, inbox } = createHarness();
    const { channel, raw } = makeChannel();
    inbox.record.mockRejectedValue(new Error('persistent database outage'));

    const exhaustedMessage = {
      ...makeMessage(),
      properties: { ...makeMessage().properties, headers: { 'x-marketplace-retry-count': 3 } },
    } as ConsumeMessage;
    await handle(service, channel, exhaustedMessage);

    expect(raw.sendToQueue).not.toHaveBeenCalled();
    expect(raw.nack).toHaveBeenCalledWith(exhaustedMessage, false, false);
    expect(raw.ack).not.toHaveBeenCalled();
  });

  it('forces broker redelivery if retry publication cannot be confirmed', async () => {
    const { service, inbox, rawChannel, rawConnection, channel } = await startHarness();
    rawChannel.sendToQueue.mockImplementation((
      _queue: string,
      _content: Buffer,
      _options: Record<string, unknown>,
      callback: (error: Error | null) => void,
    ) => {
      callback(new Error('publisher confirm failed'));
      return false;
    });

    inbox.record.mockRejectedValue(new Error('database unavailable'));
    await handle(service, channel, makeMessage());

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

  it('closes a stale connection and reconnects when only the channel closes', async () => {
    jest.useFakeTimers();
    const { service, rawChannel, rawConnection } = await startHarness();
    const channelListeners = rawChannel.on.mock.calls as unknown as Array<
      [string, (...args: unknown[]) => void]
    >;
    const onClose = channelListeners.find(([event]) => event === 'close')?.[1];

    expect(onClose).toBeDefined();
    onClose?.();
    expect(rawConnection.close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(connectMock).toHaveBeenCalledTimes(2);

    await service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('schedules another reconnect when a reconnect attempt fails', async () => {
    jest.useFakeTimers();
    const { service, rawConnection } = await startHarness();
    connectMock.mockRejectedValueOnce(new Error('broker unavailable'));
    const connectionListeners = rawConnection.on.mock.calls as unknown as Array<
      [string, (...args: unknown[]) => void]
    >;
    const onClose = connectionListeners.find(([event]) => event === 'close')?.[1];

    onClose?.();
    await jest.advanceTimersByTimeAsync(1000);

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1999);
    expect(connectMock).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(connectMock).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);

    await service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
