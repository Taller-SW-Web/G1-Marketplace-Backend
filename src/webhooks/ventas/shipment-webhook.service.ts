import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  parseShipmentStatusUpdatedEvent,
  SHIPMENT_EVENT_SINK,
  type ShipmentEventSink,
} from './shipment-event';

@Injectable()
export class ShipmentWebhookService {
  constructor(
    private readonly config: ConfigService,
    @Inject(SHIPMENT_EVENT_SINK) private readonly sink: ShipmentEventSink,
  ) {}

  async receive(headers: Record<string, string | string[] | undefined>, body: unknown) {
    const headerName = this.config.get<string>('VENTAS_WEBHOOK_HEADER', 'authorization').toLowerCase();
    const expectedToken = this.config.get<string>('VENTAS_WEBHOOK_TOKEN');
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(headerName) ||
        !expectedToken || expectedToken.length > 8192) {
      throw new ServiceUnavailableException({ error: { code: 'WEBHOOK_NOT_CONFIGURED' } });
    }

    const provided = headers[headerName];
    if (typeof provided !== 'string' || !constantTimeTextEqual(provided, expectedToken)) {
      throw new UnauthorizedException({ error: { code: 'WEBHOOK_UNAUTHORIZED' } });
    }

    const event = parseShipmentStatusUpdatedEvent(body);
    if (!event) throw new BadRequestException({ error: { code: 'INVALID_SHIPMENT_EVENT' } });

    const result = await this.sink.accept(event);
    return { data: { accepted: true, duplicate: result === 'duplicate' } };
  }
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left).digest();
  const rightDigest = createHash('sha256').update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
