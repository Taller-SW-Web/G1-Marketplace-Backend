import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import {
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
} from 'amqplib';
import { SecurityUserEventIdentityConflictError, SecurityUserEventInboxService } from './security-user-event-inbox.service';
import { SecurityUserReactionService } from './security-user-reaction.service';
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

export interface SecurityUserEventMetrics {
  processedTotal: number;
  duplicateTotal: number;
  ignoredUnknownTotal: number;
  retriedTotal: number;
  deadLetteredTotal: number;
  reconnectsTotal: number;
  lastEventId?: string;
  lastProcessedAt?: string;
}

function sanitizeCorrelationId(raw: unknown, fallback: string): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^[A-Za-z0-9._:-]{1,64}$/.test(trimmed)) return trimmed;
  }
  return fallback;
}

@Injectable()
export class SecurityUserEventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityUserEventConsumerService.name);
  private readonly enabled: boolean;
  private readonly rabbitUrl: string;
  private readonly prefetch: number;
  private readonly retrySettings: SecurityUserEventRetrySettings;
  private readonly metrics: SecurityUserEventMetrics = {
    processedTotal: 0,
    duplicateTotal: 0,
    ignoredUnknownTotal: 0,
    retriedTotal: 0,
    deadLetteredTotal: 0,
    reconnectsTotal: 0,
  };
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
    @Optional() private readonly reactions?: SecurityUserReactionService,
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

  getMetrics(): SecurityUserEventMetrics {
    return { ...this.metrics };
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
    let retryReconnect = false;
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
      if (isReconnect) this.metrics.reconnectsTotal += 1;
      this.logger.log(JSON.stringify({
        event: isReconnect ? 'security_user_consumer_reconnected' : 'security_user_consumer_connected',
        reconnectsTotal: this.metrics.reconnectsTotal,
      }));
    } catch (error) {
      if (channel) {
        try { await channel.close(); } catch { /* already closed */ }
      }
      if (connection) {
        try { await connection.close(); } catch { /* already closed */ }
      }
      if (isReconnect) {
        retryReconnect = true;
        this.logger.warn('RabbitMQ reconnect failed; will retry');
        return;
      }
      throw new Error('Could not initialize the RabbitMQ user-event consumer');
    } finally {
      this.connecting = false;
      if (retryReconnect) this.scheduleReconnect();
    }
  }

  private async handleMessage(channel: ConfirmChannel, message: ConsumeMessage): Promise<void> {
    const routingKey = message.fields.routingKey;
    const headerCorr = message.properties.headers?.['x-correlation-id'];
    const rawCorrelation = message.properties.correlationId ?? headerCorr;
    let parsed: SecurityUserEventParseResult;
    try {
      parsed = parseSecurityUserEvent(message.content, routingKey);
    } catch (error) {
      const reason = error instanceof SecurityUserEventValidationError ? error.reasonCode : 'invalid_event';
      const correlationId = sanitizeCorrelationId(rawCorrelation, 'uncorrelated');
      await this.moveToDlqOrRedeliver(channel, message, reason, correlationId);
      return;
    }
    if (parsed.kind === 'unknown') {
      channel.ack(message);
      this.metrics.ignoredUnknownTotal += 1;
      const correlationId = sanitizeCorrelationId(rawCorrelation, 'uncorrelated');
      this.logger.warn(JSON.stringify({
        event: 'security_user_event_ignored_unknown',
        correlationId,
        eventType: parsed.eventType,
        ignoredUnknownTotal: this.metrics.ignoredUnknownTotal,
      }));
      return;
    }

    const correlationId = sanitizeCorrelationId(rawCorrelation, parsed.event.eventId);
    let result: 'recorded' | 'duplicate';
    try {
      result = this.reactions
        ? await this.reactions.handleEvent(parsed.event)
        : await this.inbox.record(parsed.event);
    } catch (error) {
      if (error instanceof SecurityUserEventIdentityConflictError) {
        await this.moveToDlqOrRedeliver(channel, message, 'event_id_payload_conflict', correlationId);
        return;
      }
      await this.retryOrDeadLetter(channel, message, parsed.event.eventType, 'inbox_persistence_failure', correlationId);
      return;
    }

    channel.ack(message);
    this.metrics.lastEventId = parsed.event.eventId;
    this.metrics.lastProcessedAt = new Date().toISOString();
    if (result === 'recorded') {
      this.metrics.processedTotal += 1;
      this.logger.log(JSON.stringify({
        event: 'security_user_event_processed',
        correlationId,
        eventId: parsed.event.eventId,
        eventType: parsed.event.eventType,
        processedTotal: this.metrics.processedTotal,
      }));
    } else {
      this.metrics.duplicateTotal += 1;
      this.logger.debug(JSON.stringify({
        event: 'security_user_event_duplicate',
        correlationId,
        eventId: parsed.event.eventId,
        eventType: parsed.event.eventType,
        duplicateTotal: this.metrics.duplicateTotal,
      }));
    }
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
    correlationId = 'uncorrelated',
  ): Promise<void> {
    try {
      const retryCount = readSecurityUserEventRetryCount(message.properties.headers, this.retrySettings.maxRetries);
      if (retryCount >= this.retrySettings.maxRetries) {
        await this.moveToDlqOrRedeliver(channel, message, 'retry_exhausted', correlationId);
        return;
      }

      const nextRetry = retryCount + 1;
      const queue = securityUserEventRetryQueueName(eventType, nextRetry);
      const delay = calculateSecurityUserEventBackoff(nextRetry, this.retrySettings);
      await this.publishToRetryQueue(channel, message, queue, nextRetry, reason);
      channel.ack(message);
      this.metrics.retriedTotal += 1;
      this.logger.warn(JSON.stringify({
        event: 'security_user_event_retried',
        correlationId,
        eventType,
        retryCount: nextRetry,
        delayMs: delay,
        retriedTotal: this.metrics.retriedTotal,
      }));
    } catch (error) {
      if (error instanceof SecurityUserEventRetryMetadataError) {
        await this.moveToDlqOrRedeliver(channel, message, error.message, correlationId);
        return;
      }
      this.logger.error('Could not confirm retry publication; forcing broker redelivery');
      await this.forceRedelivery(channel);
    }
  }

  private async moveToDlqOrRedeliver(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    reason: string,
    correlationId = 'uncorrelated',
  ): Promise<void> {
    try {
      // The source queue's configured DLX routes rejected messages to seguridad.usuarios.dlq.
      channel.nack(message, false, false);
      this.metrics.deadLetteredTotal += 1;
      this.logger.warn(JSON.stringify({
        event: 'security_user_event_dead_lettered',
        correlationId,
        reason,
        deadLetteredTotal: this.metrics.deadLetteredTotal,
      }));
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
