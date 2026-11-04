import { Injectable } from '@nestjs/common';
import { CheckoutOperationState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOutboxService } from './notification-outbox.service';
import { ShipmentStatusUpdate } from './shipment-event';

export interface ShipmentNotificationReceipt {
  queued: boolean;
  eventId?: string;
}

/**
 * Internal persistence boundary for a normalized H-05 event.
 * The future HTTP receiver must authenticate G5 before invoking this method.
 */
@Injectable()
export class ShipmentEventConsumerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: NotificationOutboxService,
  ) {}

  async persistVerifiedEvent(event: ShipmentStatusUpdate): Promise<ShipmentNotificationReceipt> {
    return this.prisma.$transaction(async (tx) => {
      const checkouts = await tx.checkoutOperation.findMany({
        where: {
          externalOrderId: event.orderId,
          state: CheckoutOperationState.SUCCEEDED,
          recipientEmailEncrypted: { not: null },
        },
        select: { customerId: true, recipientEmailEncrypted: true },
        take: 2,
      });
      if (checkouts.length !== 1) return { queued: false };
      const checkout = checkouts[0];
      if (!checkout?.recipientEmailEncrypted) return { queued: false };
      const delivery = await this.outbox.enqueueShipmentUpdate(tx, {
        orderId: event.orderId,
        customerId: checkout.customerId,
        shipmentEventId: event.shipmentEventId,
        recipientEmailEncrypted: checkout.recipientEmailEncrypted,
        payloadSnapshot: {
          shipmentEventId: event.shipmentEventId,
          orderId: event.orderId,
          publicStatus: event.publicStatus,
          occurredAt: event.occurredAt,
          ...(event.estimatedDelivery ? { estimatedDelivery: event.estimatedDelivery } : {}),
        },
      });
      return { queued: true, eventId: delivery.id };
    });
  }
}
