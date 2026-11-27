import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ShipmentWebhookService } from './shipment-webhook.service';

type WebhookRequest = {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

@Controller('api/v1/webhooks/ventas')
export class ShipmentWebhookController {
  constructor(private readonly webhook: ShipmentWebhookService) {}

  @Post('envios')
  @HttpCode(200)
  receive(@Req() request: WebhookRequest) {
    return this.webhook.receive(request.headers, request.body);
  }
}
