import {
  Controller,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ShipmentEventConsumerService } from './shipment-event-consumer.service';
import { normalizeShipmentStatusWebhook } from './shipment-event';

@Controller('api/v1/webhooks/ventas')
export class ShipmentWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly events: ShipmentEventConsumerService,
  ) {}

  @Post('envios')
  @HttpCode(HttpStatus.ACCEPTED)
  async receiveShipmentUpdate(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const expected = this.config.get<string>('G5_SHIPMENT_WEBHOOK_TOKEN');
    if (!expected) {
      throw new ServiceUnavailableException({ error: { code: 'SHIPMENT_WEBHOOK_NOT_CONFIGURED' } });
    }
    const supplied = headers['x-webhook-token'];
    if (typeof supplied !== 'string' || !this.matchesToken(expected, supplied)) {
      throw new UnauthorizedException({ error: { code: 'INVALID_WEBHOOK_TOKEN' } });
    }

    let event;
    try {
      event = normalizeShipmentStatusWebhook(body);
    } catch {
      throw new UnprocessableEntityException({ error: { code: 'INVALID_SHIPMENT_EVENT' } });
    }

    const receipt = await this.events.persistVerifiedEvent(event);
    return {
      data: {
        accepted: receipt.accepted,
        duplicate: receipt.duplicate,
        orderKnown: receipt.orderKnown,
        notificationQueued: receipt.notificationQueued,
      },
    };
  }

  private matchesToken(expected: string, supplied: string): boolean {
    if (supplied.length > 2048 || /[\r\n\0]/.test(supplied)) return false;
    const expectedDigest = createHash('sha256').update(expected).digest();
    const suppliedDigest = createHash('sha256').update(supplied).digest();
    return timingSafeEqual(expectedDigest, suppliedDigest);
  }
}
