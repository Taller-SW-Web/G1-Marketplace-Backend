import { Module } from '@nestjs/common';
import { ShipmentWebhookController } from './shipment-webhook.controller';
import { SHIPMENT_EVENT_SINK } from './shipment-event';
import { ShipmentWebhookService } from './shipment-webhook.service';
import { UnavailableShipmentEventSink } from './unavailable-shipment-event.sink';

@Module({
  controllers: [ShipmentWebhookController],
  providers: [
    ShipmentWebhookService,
    UnavailableShipmentEventSink,
    { provide: SHIPMENT_EVENT_SINK, useExisting: UnavailableShipmentEventSink },
  ],
})
export class ShipmentWebhookModule {}
