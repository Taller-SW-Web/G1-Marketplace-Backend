import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  parseShipmentStatusUpdatedEvent,
  SHIPMENT_EVENT_SINK,
  type ShipmentEventSink,
} from './shipment-event';

function sanitizeCorrelationId(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['x-correlation-id'] ?? headers['x-request-id'];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  if (typeof candidate === 'string' && /^[A-Za-z0-9._:-]{1,64}$/u.test(candidate.trim())) {
    return candidate.trim();
  }
  return randomUUID();
}

@Injectable()
export class ShipmentWebhookService {
  private readonly logger = new Logger(ShipmentWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(SHIPMENT_EVENT_SINK) private readonly sink: ShipmentEventSink,
  ) {}

  async receive(headers: Record<string, string | string[] | undefined>, body: unknown) {
    const correlationId = sanitizeCorrelationId(headers);
    const headerName = this.config.get<string>('VENTAS_WEBHOOK_HEADER', 'x-webhook-token').toLowerCase();
    const expectedToken = this.config.get<string>('VENTAS_WEBHOOK_TOKEN');
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(headerName) ||
        !expectedToken || expectedToken.length > 8192) {
      throw new ServiceUnavailableException({ error: { code: 'WEBHOOK_NOT_CONFIGURED' } });
    }

    const provided = headers[headerName];
    if (typeof provided !== 'string' || !constantTimeTextEqual(provided, expectedToken)) {
      this.logger.warn(JSON.stringify({ event: 'shipment_webhook_rejected', correlationId, code: 'WEBHOOK_UNAUTHORIZED' }));
      throw new UnauthorizedException({ error: { code: 'WEBHOOK_UNAUTHORIZED' } });
    }

    const event = parseShipmentStatusUpdatedEvent(body);
    if (!event) {
      this.logger.warn(JSON.stringify({ event: 'shipment_webhook_rejected', correlationId, code: 'INVALID_SHIPMENT_EVENT' }));
      throw new BadRequestException({ error: { code: 'INVALID_SHIPMENT_EVENT' } });
    }

    const result = await this.sink.accept(event).catch((error: unknown) => {
      if (error instanceof ServiceUnavailableException) {
        this.logger.warn(JSON.stringify({
          event: 'shipment_webhook_persistence_failed',
          correlationId,
          eventId: event.eventId,
          code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE',
        }));
      }
      throw error;
    });
    this.logger.log(JSON.stringify({
      event: 'shipment_webhook_processed',
      correlationId,
      eventId: event.eventId,
      orderId: event.data.orderId,
      outcome: result,
    }));
    return { data: { accepted: true, duplicate: result === 'duplicate' } };
  }
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
