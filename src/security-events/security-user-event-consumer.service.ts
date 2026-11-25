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
  SECURITY_USER_EVENTS_EXCHANGE,
  SECURITY_USER_EVENTS_EXCHANGE_TYPE,
  SECURITY_USER_EVENTS_QUEUE,
  SecurityUserEventValidationError,
} from './security-user-event';

@Injectable()
export class SecurityUserEventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityUserEventConsumerService.name);
  private readonly enabled: boolean;
  private readonly rabbitUrl: string;
  private readonly dlqQueue: string;
  private readonly prefetch: number;
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
    this.dlqQueue = this.config.get<string>('SECURITY_EVENTS_DLQ_QUEUE', 'marketplace.usuarios.dlq');
    this.prefetch = this.config.get<number>('SECURITY_EVENTS_PREFETCH', 1);
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
      await channel.assertQueue(SECURITY_USER_EVENTS_QUEUE, { durable: true });
      await channel.bindQueue(SECURITY_USER_EVENTS_QUEUE, SECURITY_USER_EVENTS_EXCHANGE, SECURITY_USER_EVENTS_BINDING);
      await channel.assertQueue(this.dlqQueue, { durable: true });
      await channel.prefetch(this.prefetch);

      this.connection = connection;
      this.channel = channel;
      connection.on('error', () => this.logger.warn('RabbitMQ connection error; details omitted'));
      connection.on('close', () => {
        if (this.connection === connection) this.scheduleReconnect();
      });
      channel.on('error', () => this.logger.warn('RabbitMQ channel error; details omitted'));
      channel.on('close', () => {
        if (this.channel === channel) this.scheduleReconnect();
      });

      const consumer = await channel.consume(
        SECURITY_USER_EVENTS_QUEUE,
        (message) => {
          if (message) void this.handleMessage(channel as ConfirmChannel, message);
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
    try {
      const parsed = parseSecurityUserEvent(message.content, routingKey);
      if (parsed.kind === 'unknown') {
        channel.ack(message);
        this.logger.warn(`Ignored unknown security event type: ${parsed.eventType}`);
        return;
      }

      const result = await this.inbox.record(parsed.event);
      channel.ack(message);
      if (result === 'recorded') this.logger.log(`Recorded security event type ${parsed.event.eventType}`);
      else this.logger.debug(`Acknowledged duplicate security event type ${parsed.event.eventType}`);
    } catch (error) {
      const reason = error instanceof SecurityUserEventValidationError
        ? error.reasonCode
        : error instanceof SecurityUserEventIdentityConflictError
          ? 'event_id_payload_conflict'
          : 'inbox_persistence_failure';
      try {
        await this.publishToDlq(channel, message, reason);
        channel.ack(message);
        this.logger.warn(`Moved security event to DLQ (${reason})`);
      } catch {
        this.logger.error('Could not confirm DLQ publication; forcing broker redelivery');
        await this.forceRedelivery(channel);
      }
    }
  }

  private async publishToDlq(channel: ConfirmChannel, message: ConsumeMessage, reason: string): Promise<void> {
    const headers = {
      ...(message.properties.headers ?? {}),
      'x-marketplace-dead-letter-reason': reason,
      'x-marketplace-original-routing-key': message.fields.routingKey,
    };
    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(this.dlqQueue, message.content, {
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
    const connection = this.connection;
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
