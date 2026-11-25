import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { SecurityUserEventInboxService } from './security-user-event-inbox.service';
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
};

function makeMessage(event: { tipo: string; [key: string]: unknown } = EVENT): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(event)),
    fields: { routingKey: event.tipo },
    properties: { headers: {}, contentType: 'application/json' },
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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecurityUserEventConsumerService(
      new ConfigService({
        SECURITY_EVENTS_ENABLED: false,
        SECURITY_EVENTS_PREFETCH: 1,
        RABBITMQ_URL: 'amqps://user:secret@broker.example/vhost',
      }),
      inbox,
    );
  });

  it('stays offline by default', async () => {
    await service.onModuleInit();

    expect(connect).not.toHaveBeenCalled();
  });

  it('declares the durable topology and cancels the consumer on shutdown when enabled', async () => {
    const channel = makeChannel();
    const connection = makeConnection(channel);
    connect.mockResolvedValue(connection);
    service = new SecurityUserEventConsumerService(
      new ConfigService({
        SECURITY_EVENTS_ENABLED: true,
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

    await (service as unknown as ConsumerTestSurface).handleMessage(channel, message);

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

    await (service as unknown as ConsumerTestSurface).handleMessage(channel, message);

    expect(record).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('rejects an invalid event for broker-side DLX routing', async () => {
    const channel = makeChannel();
    const message = makeMessage({ ...EVENT, version: 2 });

    await (service as unknown as ConsumerTestSurface).handleMessage(channel, message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('forces broker redelivery if rejecting to the DLX fails', async () => {
    const channel = makeChannel();
    channel.nack.mockImplementation(() => { throw new Error('channel closed'); });
    const message = makeMessage({ ...EVENT, version: 2 });

    await (service as unknown as ConsumerTestSurface).handleMessage(channel, message);

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalledTimes(1);
  });
});
