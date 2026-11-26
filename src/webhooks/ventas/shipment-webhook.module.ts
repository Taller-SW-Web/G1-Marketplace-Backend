import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { C002QaWorker } from './c002-qa.worker';
import { ShipmentWebhookController } from './shipment-webhook.controller';
import { SHIPMENT_EVENT_SINK } from './shipment-event';
import { ShipmentWebhookService } from './shipment-webhook.service';
import { PrismaShipmentEventSink } from './prisma-shipment-event.sink';

@Module({
  imports: [PrismaModule],
  controllers: [ShipmentWebhookController],
  providers: [
    ShipmentWebhookService,
    C002QaWorker,
    PrismaShipmentEventSink,
    { provide: SHIPMENT_EVENT_SINK, useExisting: PrismaShipmentEventSink },
  ],
})
export class ShipmentWebhookModule {}
