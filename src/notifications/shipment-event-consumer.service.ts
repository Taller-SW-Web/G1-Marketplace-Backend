import { ConflictException, Injectable } from '@nestjs/common';
import { CheckoutOperationState } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOutboxService } from './notification-outbox.service';
import { ShipmentStatusUpdate } from './shipment-event';

export interface ShipmentNotificationReceipt {
  accepted: true;
  duplicate: boolean;
  orderKnown: boolean;
  notificationQueued: boolean;
}

/**
 * Durable inbox for an authenticated, normalized H-05 event. The unique event id
 * makes Sales retries safe; events without a local checkout remain available for
 * the tracking projection and can be reconciled when the order is later known.
 */
@Injectable()
export class ShipmentEventConsumerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: NotificationOutboxService,
  ) {}

  async persistVerifiedEvent(event: ShipmentStatusUpdate): Promise<ShipmentNotificationReceipt> {
    const fingerprint = this.fingerprint(event);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.shipmentWebhookEvent.findUnique({ where: { eventId: event.shipmentEventId } });
        if (existing && existing.payloadFingerprint !== fingerprint) {
          throw new ConflictException({ error: { code: 'WEBHOOK_EVENT_ID_CONFLICT' } });
        }
        if (!existing) {
          await tx.shipmentWebhookEvent.create({
            data: {
              eventId: event.shipmentEventId,
              orderId: event.orderId,
              publicStatus: event.publicStatus,
              trackingNumber: event.trackingNumber,
              occurredAt: new Date(event.occurredAt),
              estimatedDeliveryDate: event.estimatedDelivery ? new Date(`${event.estimatedDelivery}T00:00:00.000Z`) : null,
              payloadFingerprint: fingerprint,
            },
          });
        }
        const notification = await this.queueNotification(tx, event);
        if (notification.notificationQueued) {
          await tx.shipmentWebhookEvent.update({
            where: { eventId: event.shipmentEventId },
            data: { notificationQueuedAt: new Date() },
          });
        }
        return {
          accepted: true,
          duplicate: Boolean(existing),
          orderKnown: notification.orderKnown,
          notificationQueued: notification.notificationQueued,
        };
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const existing = await this.prisma.shipmentWebhookEvent.findUnique({ where: { eventId: event.shipmentEventId } });
      if (!existing) throw error;
      if (existing.payloadFingerprint !== fingerprint) {
        throw new ConflictException({ error: { code: 'WEBHOOK_EVENT_ID_CONFLICT' } });
      }
      const notification = await this.prisma.$transaction(async (tx) => {
        const queued = await this.queueNotification(tx, event);
        if (queued.notificationQueued && !existing.notificationQueuedAt) {
          await tx.shipmentWebhookEvent.update({ where: { eventId: event.shipmentEventId }, data: { notificationQueuedAt: new Date() } });
        }
        return queued;
      });
      return {
        accepted: true,
        duplicate: true,
        orderKnown: notification.orderKnown,
        notificationQueued: notification.notificationQueued,
      };
    }
  }

  async reconcilePendingNotifications(orderId: string): Promise<void> {
    const pending = await this.prisma.shipmentWebhookEvent.findMany({
      where: { orderId, notificationQueuedAt: null },
      orderBy: [{ occurredAt: 'asc' }, { eventId: 'asc' }],
      take: 100,
    });
    for (const receipt of pending) {
      const event: ShipmentStatusUpdate = {
        shipmentEventId: receipt.eventId,
        orderId: receipt.orderId,
        publicStatus: receipt.publicStatus as ShipmentStatusUpdate['publicStatus'],
        trackingNumber: receipt.trackingNumber,
        occurredAt: receipt.occurredAt.toISOString(),
        ...(receipt.estimatedDeliveryDate ? { estimatedDelivery: receipt.estimatedDeliveryDate.toISOString().slice(0, 10) } : {}),
      };
      await this.prisma.$transaction(async (tx) => {
        if ((await this.queueNotification(tx, event)).notificationQueued) {
          await tx.shipmentWebhookEvent.update({ where: { eventId: receipt.eventId }, data: { notificationQueuedAt: new Date() } });
        }
      });
    }
  }

  private async queueNotification(
    tx: import('@prisma/client').Prisma.TransactionClient,
    event: ShipmentStatusUpdate,
  ): Promise<{ orderKnown: boolean; notificationQueued: boolean }> {
    const checkouts = await tx.checkoutOperation.findMany({
      where: {
        externalOrderId: event.orderId,
        state: CheckoutOperationState.SUCCEEDED,
      },
      select: { customerId: true, recipientEmailEncrypted: true },
      take: 2,
    });
    if (checkouts.length !== 1) return { orderKnown: checkouts.length > 0, notificationQueued: false };
    const checkout = checkouts[0];
    if (!checkout?.recipientEmailEncrypted) return { orderKnown: true, notificationQueued: false };
    await this.outbox.enqueueShipmentUpdate(tx, {
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
    return { orderKnown: true, notificationQueued: true };
  }

  private fingerprint(event: ShipmentStatusUpdate): string {
    return createHash('sha256').update(JSON.stringify({
      shipmentEventId: event.shipmentEventId,
      orderId: event.orderId,
      publicStatus: event.publicStatus,
      trackingNumber: event.trackingNumber,
      occurredAt: event.occurredAt,
      estimatedDelivery: event.estimatedDelivery ?? null,
    })).digest('hex');
  }
}
