import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ShipmentEventSink, ShipmentStatusUpdatedEvent } from './shipment-event';

/**
 * A single PostgreSQL insert is the durable inbox transaction. The unique
 * eventId arbitrates concurrent retries; the HTTP layer acknowledges only
 * after the insert commits.
 */
@Injectable()
export class PrismaShipmentEventSink implements ShipmentEventSink {
  constructor(private readonly prisma: PrismaService) {}

  async accept(event: ShipmentStatusUpdatedEvent): Promise<'accepted' | 'duplicate'> {
    try {
      const payload = JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue;
      await this.prisma.shipmentEventInbox.create({
        data: {
          eventId: event.eventId,
          orderId: event.data.orderId,
          payload,
        },
      });
      return 'accepted';
    } catch (error) {
      if (isEventIdUniqueConflict(error)) return 'duplicate';
      throw new ServiceUnavailableException({
        error: { code: 'SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE' },
      });
    }
  }
}

function isEventIdUniqueConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.length === 1 && (target[0] === 'event_id' || target[0] === 'eventId');
  }
  return target === 'shipment_event_inbox_pkey' || target === 'event_id' || target === 'eventId';
}
