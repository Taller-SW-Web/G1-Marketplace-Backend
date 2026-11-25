import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  SecurityUserEventIdentityConflictError,
  SecurityUserEventInboxService,
} from './security-user-event-inbox.service';
import { SecurityUserEventConsumerService } from './security-user-event-consumer.service';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

const EVENT = {
  eventoId: '22222222-2222-4222-8222-222222222222',
  tipo: 'usuario.creado',
  version: 1,
  fecha: '2026-11-24T12:30:45.123Z',
  usuarioId: '11111111-1111-4111-8111-111111111111',
  datos: { roles: ['CLIENTE'] },
};

type ConsumerTestSurface = {
  handleMessage(channel: ConfirmChannel, message: ConsumeMessage): Promise<void>;
  assertRetryQueues(channel: ConfirmChannel): Promise<void>;
};

function makeMessage(
  event: { tipo: string; [key: string]: unknown } = EVENT,
  headers: Record<string, unknown> = {},
): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(event)),
    fields: { routingKey: event.tipo },
    properties: { headers, contentType: 'application/json' },
  } as unknown as ConsumeMessage;
}

function makeChannel(confirmError?: Error) {
  return {
    ack: jest.fn(),
    nack: jest.fn(),
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({ queue: 'queue' }),
    bindQueue: jest.fn().mockResolvedValue({}),
    cancel: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue(undefined),
    consume: jest.fn().mockResolvedValue({ consumerTag: 'security-user-events' }),
    on: jest.fn().mockReturnThis(),
    prefetch: jest.fn().mockResolvedValue(undefined),
    sendToQueue: jest.fn((_queue, _content, _options, confirm) => confirm?.(confirmError, {})),
  } as unknown as ConfirmChannel & {
    ack: jest.Mock;
    nack: jest.Mock;
    assertExchange: jest.Mock;
    assertQueue: jest.Mock;
    bindQueue: jest.Mock;
    cancel: jest.Mock;
    close: jest.Mock;
    consume: jest.Mock;
    prefetch: jest.Mock;
    sendToQueue: jest.Mock;
  };
}

function makeConnection(channel: ConfirmChannel) {
  return {
    close: jest.fn().mockResolvedValue(undefined),
    createConfirmChannel: jest.fn().mockResolvedValue(channel),
    on: jest.fn().mockReturnThis(),
  } as unknown as ChannelModel & {
    close: jest.Mock;
    createConfirmChannel: jest.Mock;
    on: jest.Mock;
  };
}

describe('SecurityUserEventConsumerService', () => {
  const record = jest.fn();
  const inbox = { record } as unknown as SecurityUserEventInboxService;
  const connect = amqp.connect as jest.Mock;
  let service: SecurityUserEventConsumerService;
  let handleMessage: ConsumerTestSurface['handleMessage'];

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SecurityUserEventConsumerService(
    new ConfigService({
      SECURITY_EVENTS_ENABLED: false,
        SECURITY_EVENTS_MAX_RETRIES: 3,
        SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
        SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
        SECURITY_EVENTS_PREFETCH: 1,
        RABBITMQ_URL: 'amqps://user:secret@broker.example/vhost',
      }),
      inbox,
    );
    handleMessage = (service as unknown as ConsumerTestSurface).handleMessage.bind(service);
  });

  it('stays offline by default', async () => {
    await service.onModuleInit();

    expect(connect).not.toHaveBeenCalled();
  });

  it('declares durable topology and cancels the consumer on shutdown when enabled', async () => {
    const channel = makeChannel();
    const connection = makeConnection(channel);
    connect.mockResolvedValue(connection);
    service = new SecurityUserEventConsumerService(
      new ConfigService({
        SECURITY_EVENTS_ENABLED: true,
        SECURITY_EVENTS_MAX_RETRIES: 3,
        SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
        SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
        SECURITY_EVENTS_PREFETCH: 2,
        RABBITMQ_URL: 'amqps://user:secret@broker.example/vhost',
      }),
      inbox,
    );

    await service.onModuleInit();
    expect(connect).toHaveBeenCalledWith(expect.stringContaining('heartbeat=30'));
    expect(channel.assertExchange).toHaveBeenCalledWith('seguridad.usuarios', 'topic', { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith('marketplace.usuarios', {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'seguridad.usuarios.dlx',
        'x-dead-letter-routing-key': 'descartado',
      },
    });
    expect(channel.bindQueue).toHaveBeenCalledWith('marketplace.usuarios', 'seguridad.usuarios', 'usuario.*');
    expect(channel.prefetch).toHaveBeenCalledWith(2);
    expect(channel.consume).toHaveBeenCalledWith('marketplace.usuarios', expect.any(Function), { noAck: false });

    await service.onModuleDestroy();
    expect(channel.cancel).toHaveBeenCalledWith('security-user-events');
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('acknowledges and records a valid event', async () => {
    const channel = makeChannel();
    record.mockResolvedValue('recorded');
    const message = makeMessage();

    await handleMessage(channel, message);

    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      eventId: EVENT.eventoId,
      eventType: EVENT.tipo,
      userId: EVENT.usuarioId,
    }));
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('acknowledges an unknown event type without persisting it', async () => {
    const channel = makeChannel();
    const message = makeMessage({ ...EVENT, tipo: 'usuario.evento_nuevo', datos: {} });

    await handleMessage(channel, message);

    expect(record).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('rejects an invalid schema message for broker-side DLX routing', async () => {
    const channel = makeChannel();
    const message = makeMessage({ ...EVENT, version: 2 });

    await handleMessage(channel, message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('rejects an event identity conflict for broker-side DLX routing', async () => {
    record.mockRejectedValue(new SecurityUserEventIdentityConflictError());
    const channel = makeChannel();
    const message = makeMessage();

    await handleMessage(channel, message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('forces broker redelivery if DLX rejection fails on a closed channel', async () => {
    const channel = makeChannel();
    channel.nack.mockImplementation(() => { throw new Error('channel closed'); });
    const message = makeMessage({ ...EVENT, version: 2 });

    await handleMessage(channel, message);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalledTimes(1);
  });

  it('publishes a transient inbox failure to a durable retry queue before acknowledging the source', async () => {
    record.mockRejectedValue(new Error('database unavailable'));
    const channel = makeChannel();
    const message = makeMessage();

    await handleMessage(channel, message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'marketplace.usuarios.retry.1.usuario_creado',
      message.content,
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({
          'x-marketplace-retry-count': 1,
          'x-marketplace-last-error': 'inbox_persistence_failure',
        }),
      }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('declares one durable TTL/DLX retry queue per known event type and retry number', async () => {
    const channel = makeChannel();

    await (service as unknown as ConsumerTestSurface).assertRetryQueues(channel);

    expect(channel.assertQueue).toHaveBeenCalledTimes(21);
    expect(channel.assertQueue).toHaveBeenNthCalledWith(1,
      'marketplace.usuarios.retry.1.usuario_creado', {
        durable: true,
        arguments: {
          'x-message-ttl': 1000,
          'x-dead-letter-exchange': 'seguridad.usuarios',
          'x-dead-letter-routing-key': 'usuario.creado',
        },
      });
  });

  it('rejects a transient failure through the configured DLX after the retries are exhausted', async () => {
    record.mockRejectedValue(new Error('database unavailable'));
    const channel = makeChannel();
    const message = makeMessage(EVENT, { 'x-marketplace-retry-count': 3 });

    await handleMessage(channel, message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('does not acknowledge the source if retry publication is not confirmed', async () => {
    record.mockRejectedValue(new Error('database unavailable'));
    const channel = makeChannel(new Error('confirm failed'));

    await handleMessage(channel, makeMessage());

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalledTimes(1);
  });

  it('waits for retry publisher confirmation before acknowledging the source', async () => {
      record.mockRejectedValue(new Error('database unavailable'));
      const channel = makeChannel();
      const message = makeMessage();
      let confirmPublish: ((error: Error | null) => void) | undefined;
      let notifyPublishStarted!: () => void;
      const publishStarted = new Promise<void>((resolve) => { notifyPublishStarted = resolve; });

      (channel.sendToQueue as jest.Mock).mockImplementation(
        (_queue: unknown, _content: unknown, _options: unknown, confirm: (error: Error | null) => void) => {
          confirmPublish = confirm;
          notifyPublishStarted();
          return true;
        },
      );

      const handling = handleMessage(channel, message);
      await publishStarted;

      expect(channel.sendToQueue).toHaveBeenCalledWith(
        'marketplace.usuarios.retry.1.usuario_creado',
        message.content,
        expect.objectContaining({ persistent: true }),
        expect.any(Function),
      );
      expect(channel.ack).not.toHaveBeenCalled();
      if (!confirmPublish) throw new Error('publish confirmation callback was not captured');

      confirmPublish(null);
      await handling;

      expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('closes a stale connection and schedules reconnection when only the channel closes', async () => {
    jest.useFakeTimers();
    const channel = makeChannel();
    const connection = makeConnection(channel);
    connect.mockResolvedValue(connection);
    service = new SecurityUserEventConsumerService(
      new ConfigService({
        SECURITY_EVENTS_ENABLED: true,
        SECURITY_EVENTS_MAX_RETRIES: 3,
        SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
        SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
        SECURITY_EVENTS_PREFETCH: 1,
        RABBITMQ_URL: 'amqps://user:secret@broker.example/vhost',
      }),
      inbox,
    );
    await service.onModuleInit();
    const closeListener = (channel.on as jest.Mock).mock.calls
      .find(([event]) => event === 'close')?.[1] as (() => void) | undefined;

    expect(closeListener).toBeDefined();
    closeListener?.();
    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(2);

    await service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
