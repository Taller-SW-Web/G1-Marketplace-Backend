import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
} from 'amqplib';
import { SecurityUserEventIdentityConflictError, SecurityUserEventInboxService } from './security-user-event-inbox.service';
import {
  parseSecurityUserEvent,
  SECURITY_USER_EVENTS_BINDING,
  SECURITY_USER_EVENTS_DEAD_LETTER_EXCHANGE,
  SECURITY_USER_EVENTS_DEAD_LETTER_ROUTING_KEY,
  SECURITY_USER_EVENTS_EXCHANGE,
  SECURITY_USER_EVENTS_EXCHANGE_TYPE,
  SECURITY_USER_EVENTS_QUEUE,
  SECURITY_USER_EVENT_TYPES,
  SecurityUserEventParseResult,
  SecurityUserEventType,
  SecurityUserEventValidationError,
} from './security-user-event';
import {
  calculateSecurityUserEventBackoff,
  readSecurityUserEventRetryCount,
  SecurityUserEventRetryMetadataError,
  SecurityUserEventRetrySettings,
  securityUserEventRetryQueueName,
  SECURITY_USER_EVENT_RETRY_COUNT_HEADER,
} from './security-user-event-reliability';

@Injectable()
export class SecurityUserEventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityUserEventConsumerService.name);
  private readonly enabled: boolean;
  private readonly rabbitUrl: string;
  private readonly prefetch: number;
  private readonly retrySettings: SecurityUserEventRetrySettings;
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private consumerTag?: string;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private connecting = false;
  private shuttingDown = false;

  constructor(
    private readonly config: ConfigService,
    private readonly inbox: SecurityUserEventInboxService,
  ) {
    this.enabled = this.config.get<boolean>('SECURITY_EVENTS_ENABLED', false);
    this.rabbitUrl = this.config.get<string>('RABBITMQ_URL', '');
    this.prefetch = this.config.get<number>('SECURITY_EVENTS_PREFETCH', 1);
    this.retrySettings = {
      maxRetries: this.config.get<number>('SECURITY_EVENTS_MAX_RETRIES', 3),
      backoffBaseMs: this.config.get<number>('SECURITY_EVENTS_BACKOFF_BASE_MS', 1000),
      backoffMaxMs: this.config.get<number>('SECURITY_EVENTS_BACKOFF_MAX_MS', 30000),
    };
  }

  async onModuleInit(): Promise<void> {
    if (this.enabled) await this.connectAndConsume(false);
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const channel = this.channel;
    const connection = this.connection;
    const consumerTag = this.consumerTag;
    this.channel = undefined;
    this.connection = undefined;
    this.consumerTag = undefined;
    try {
      if (channel && consumerTag) await channel.cancel(consumerTag);
    } catch {
      // The broker may already have closed the channel.
    }
    try {
      if (channel) await channel.close();
    } catch {
      // The broker may already have closed the channel.
    }
    try {
      if (connection) await connection.close();
    } catch {
      // The broker may already have closed the connection.
    }
  }

  private async connectAndConsume(isReconnect: boolean): Promise<void> {
    if (this.shuttingDown || this.connecting) return;
    this.connecting = true;
    let connection: ChannelModel | undefined;
    let channel: ConfirmChannel | undefined;
    try {
      const connectUrl = new URL(this.rabbitUrl);
      connectUrl.searchParams.set('heartbeat', '30');
      connection = await amqp.connect(connectUrl.toString());
      channel = await connection.createConfirmChannel();
      await channel.assertExchange(SECURITY_USER_EVENTS_EXCHANGE, SECURITY_USER_EVENTS_EXCHANGE_TYPE, {
        durable: true,
      });
      await channel.assertQueue(SECURITY_USER_EVENTS_QUEUE, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': SECURITY_USER_EVENTS_DEAD_LETTER_EXCHANGE,
          'x-dead-letter-routing-key': SECURITY_USER_EVENTS_DEAD_LETTER_ROUTING_KEY,
        },
      });
      await channel.bindQueue(SECURITY_USER_EVENTS_QUEUE, SECURITY_USER_EVENTS_EXCHANGE, SECURITY_USER_EVENTS_BINDING);
      await this.assertRetryQueues(channel);
      await channel.prefetch(this.prefetch);

      this.connection = connection;
      this.channel = channel;
      connection.on('error', () => this.logger.warn('RabbitMQ connection error; details omitted'));
      connection.on('close', () => {
        if (this.connection === connection) this.scheduleReconnect();
      });
      channel.on('error', () => this.logger.warn('RabbitMQ channel error; details omitted'));
      channel.on('close', () => {
        if (this.channel !== channel) return;
        const activeConnection = this.connection;
        this.channel = undefined;
        this.connection = undefined;
        this.consumerTag = undefined;
        void activeConnection?.close().catch(() => undefined);
        this.scheduleReconnect();
      });

      const consumer = await channel.consume(
        SECURITY_USER_EVENTS_QUEUE,
        (message) => {
          if (message) {
            void this.handleMessage(channel as ConfirmChannel, message).catch(async () => {
              this.logger.error('Unexpected consumer failure; forcing broker redelivery');
              await this.forceRedelivery(channel as ConfirmChannel);
            });
          }
        },
        { noAck: false },
      );
      this.consumerTag = consumer.consumerTag;
      this.reconnectAttempt = 0;
      this.logger.log('RabbitMQ user-event consumer connected');
    } catch (error) {
      if (channel) {
        try { await channel.close(); } catch { /* already closed */ }
      }
      if (connection) {
        try { await connection.close(); } catch { /* already closed */ }
      }
      if (isReconnect) {
        this.connecting = false;
        this.scheduleReconnect();
        this.logger.warn('RabbitMQ reconnect failed; will retry');
        return;
      }
      throw new Error('Could not initialize the RabbitMQ user-event consumer');
    } finally {
      this.connecting = false;
    }
  }

  private async handleMessage(channel: ConfirmChannel, message: ConsumeMessage): Promise<void> {
    const routingKey = message.fields.routingKey;
    let parsed: SecurityUserEventParseResult;
    try {
      parsed = parseSecurityUserEvent(message.content, routingKey);
    } catch (error) {
      const reason = error instanceof SecurityUserEventValidationError ? error.reasonCode : 'invalid_event';
      await this.moveToDlqOrRedeliver(channel, message, reason);
      return;
    }
    if (parsed.kind === 'unknown') {
      channel.ack(message);
      this.logger.warn(`Ignored unknown security event type: ${parsed.eventType}`);
      return;
    }

    let result: 'recorded' | 'duplicate';
    try {
      result = await this.inbox.record(parsed.event);
    } catch (error) {
      if (error instanceof SecurityUserEventIdentityConflictError) {
        await this.moveToDlqOrRedeliver(channel, message, 'event_id_payload_conflict');
        return;
      }
      await this.retryOrDeadLetter(channel, message, parsed.event.eventType, 'inbox_persistence_failure');
      return;
    }

    channel.ack(message);
    if (result === 'recorded') this.logger.log(`Recorded security event type ${parsed.event.eventType}`);
    else this.logger.debug(`Acknowledged duplicate security event type ${parsed.event.eventType}`);
  }

  private async assertRetryQueues(channel: ConfirmChannel): Promise<void> {
    for (const eventType of SECURITY_USER_EVENT_TYPES) {
      for (let retryNumber = 1; retryNumber <= this.retrySettings.maxRetries; retryNumber += 1) {
        const queue = securityUserEventRetryQueueName(eventType, retryNumber);
        const delay = calculateSecurityUserEventBackoff(retryNumber, this.retrySettings);
        await channel.assertQueue(queue, {
          durable: true,
          arguments: {
            'x-message-ttl': delay,
            'x-dead-letter-exchange': SECURITY_USER_EVENTS_EXCHANGE,
            'x-dead-letter-routing-key': eventType,
          },
        });
      }
    }
  }

  private async retryOrDeadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    eventType: SecurityUserEventType,
    reason: string,
  ): Promise<void> {
    try {
      const retryCount = readSecurityUserEventRetryCount(message.properties.headers, this.retrySettings.maxRetries);
      if (retryCount >= this.retrySettings.maxRetries) {
        await this.moveToDlqOrRedeliver(channel, message, 'retry_exhausted');
        return;
      }

      const nextRetry = retryCount + 1;
      const queue = securityUserEventRetryQueueName(eventType, nextRetry);
      const delay = calculateSecurityUserEventBackoff(nextRetry, this.retrySettings);
      await this.publishToRetryQueue(channel, message, queue, nextRetry, reason);
      channel.ack(message);
      this.logger.warn(`Scheduled security event retry ${nextRetry} after ${delay}ms`);
    } catch (error) {
      if (error instanceof SecurityUserEventRetryMetadataError) {
        await this.moveToDlqOrRedeliver(channel, message, error.message);
        return;
      }
      this.logger.error('Could not confirm retry publication; forcing broker redelivery');
      await this.forceRedelivery(channel);
    }
  }

  private async moveToDlqOrRedeliver(channel: ConfirmChannel, message: ConsumeMessage, reason: string): Promise<void> {
    try {
      // The source queue's configured DLX routes rejected messages to seguridad.usuarios.dlq.
      channel.nack(message, false, false);
      this.logger.warn(`Rejected security event for dead-letter routing (${reason})`);
    } catch {
      this.logger.error('Could not reject security event; forcing broker redelivery');
      await this.forceRedelivery(channel);
    }
  }

  private async publishToRetryQueue(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    queue: string,
    retryCount: number,
    reason: string,
  ): Promise<void> {
    const headers = {
      ...(message.properties.headers ?? {}),
      [SECURITY_USER_EVENT_RETRY_COUNT_HEADER]: retryCount,
      'x-marketplace-last-error': reason,
    };
    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(queue, message.content, {
        persistent: true,
        contentType: message.properties.contentType ?? 'application/json',
        contentEncoding: message.properties.contentEncoding,
        correlationId: message.properties.correlationId,
        messageId: message.properties.messageId,
        headers,
      }, (error) => error ? reject(error) : resolve());
    });
  }

  private async forceRedelivery(channel: ConfirmChannel): Promise<void> {
    const connection = this.channel === channel ? this.connection : undefined;
    try { await channel.close(); } catch { /* channel close is best-effort */ }
    try { await connection?.close(); } catch { /* connection close is best-effort */ }
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.shuttingDown || this.reconnectTimer || this.connecting) return;
    this.channel = undefined;
    this.connection = undefined;
    this.consumerTag = undefined;
    const delay = Math.min(1000 * (2 ** Math.min(this.reconnectAttempt, 5)), 30000);
    this.reconnectAttempt += 1;
    this.logger.warn(`RabbitMQ reconnect scheduled after ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectAndConsume(true);
    }, delay);
    this.reconnectTimer.unref();
  }
}
