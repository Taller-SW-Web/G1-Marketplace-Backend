import { ConfigService } from '@nestjs/config';
import { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { SecurityUserEventInboxService } from './security-user-event-inbox.service';
import { SecurityUserEventConsumerService } from './security-user-event-consumer.service';

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

function makeMessage(headers: Record<string, unknown> = {}): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(EVENT)),
    fields: { routingKey: 'usuario.creado' },
    properties: { headers, contentType: 'application/json' },
  } as unknown as ConsumeMessage;
}

function makeChannel(confirmError?: Error) {
  return {
    ack: jest.fn(),
    assertQueue: jest.fn().mockResolvedValue({}),
    close: jest.fn().mockResolvedValue(undefined),
    sendToQueue: jest.fn((_queue, _content, _options, confirm) => confirm?.(confirmError, {})),
  } as unknown as ConfirmChannel & {
    ack: jest.Mock;
    assertQueue: jest.Mock;
    close: jest.Mock;
    sendToQueue: jest.Mock;
  };
}

describe('SecurityUserEventConsumerService reliability settlement', () => {
  const inbox = { record: jest.fn() } as unknown as SecurityUserEventInboxService;
  let service: SecurityUserEventConsumerService;
  let handleMessage: ConsumerTestSurface['handleMessage'];

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SecurityUserEventConsumerService(
      new ConfigService({
        SECURITY_EVENTS_ENABLED: false,
        SECURITY_EVENTS_DLQ_QUEUE: 'marketplace.usuarios.dlq',
        SECURITY_EVENTS_MAX_RETRIES: 3,
        SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
        SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
      }),
      inbox,
    );
    handleMessage = (service as unknown as ConsumerTestSurface).handleMessage.bind(service);
  });

  it('publishes a transient inbox failure to a durable retry queue before acknowledging the source', async () => {
    (inbox.record as jest.Mock).mockRejectedValue(new Error('database unavailable'));
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

  it('moves an invalid schema message directly to the DLQ after publisher confirmation', async () => {
    const channel = makeChannel();
    const message = makeMessage();
    message.content = Buffer.from(JSON.stringify({ ...EVENT, version: 2 }));

    await handleMessage(channel, message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'marketplace.usuarios.dlq',
      message.content,
      expect.objectContaining({
        persistent: true,
        headers: expect.objectContaining({ 'x-marketplace-dead-letter-reason': 'unsupported_schema_version' }),
      }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(inbox.record).not.toHaveBeenCalled();
  });

  it('sends a transient failure to the DLQ after the configured retries are exhausted', async () => {
    (inbox.record as jest.Mock).mockRejectedValue(new Error('database unavailable'));
    const channel = makeChannel();
    const message = makeMessage({ 'x-marketplace-retry-count': 3 });

    await handleMessage(channel, message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'marketplace.usuarios.dlq',
      message.content,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-marketplace-dead-letter-reason': 'retry_exhausted' }),
      }),
      expect.any(Function),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('does not acknowledge the source if the retry publication is not confirmed', async () => {
    (inbox.record as jest.Mock).mockRejectedValue(new Error('database unavailable'));
    const channel = makeChannel(new Error('confirm failed'));

    await handleMessage(channel, makeMessage());

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalled();
  });
});
