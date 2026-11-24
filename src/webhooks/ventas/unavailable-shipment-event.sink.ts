import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ShipmentEventSink, ShipmentStatusUpdatedEvent } from './shipment-event';

/** Default until a durable transactional inbox/outbox is agreed and implemented. */
@Injectable()
export class UnavailableShipmentEventSink implements ShipmentEventSink {
  async accept(_event: ShipmentStatusUpdatedEvent): Promise<'accepted' | 'duplicate'> {
    throw new ServiceUnavailableException({ error: { code: 'SHIPMENT_EVENT_PROCESSOR_UNAVAILABLE' } });
  }
}
