import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { NotificationDeliveryType } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';

export interface EnqueueOrderConfirmationInput {
  orderId: string;
  customerId: string;
  eventKey: string;
  /** Ciphertext supplied by an approved encryption boundary; plaintext is never accepted here. */
  recipientEmailEncrypted: Uint8Array;
  payloadVersion: string;
  payloadSnapshot: import('@prisma/client').Prisma.InputJsonValue;
  verifiedOrderState: string;
}

export interface EnqueueShipmentUpdateInput {
  orderId: string;
  customerId: string;
  shipmentEventId: string;
  recipientEmailEncrypted: Uint8Array;
  payloadSnapshot: import('@prisma/client').Prisma.InputJsonValue;
}

@Injectable()
export class NotificationOutboxService {
  /**
   * Persist one logical delivery in the caller's transaction after it verifies PAGADO.
   * It does not send mail; provider and worker remain disabled pending approval.
   */
  async enqueueOrderConfirmation(
    tx: import('@prisma/client').Prisma.TransactionClient,
    input: EnqueueOrderConfirmationInput,
  ) {
    if (input.verifiedOrderState !== 'PAGADO') {
      throw new ConflictException({ error: { code: 'ORDER_NOT_CONFIRMED' } });
    }
    if (!input.orderId.trim() || !input.customerId.trim() || !input.eventKey.trim()
      || input.eventKey.length > 255 || !input.payloadVersion.trim() || input.payloadVersion.length > 50
      || !(input.recipientEmailEncrypted instanceof Uint8Array) || input.recipientEmailEncrypted.byteLength === 0) {
      throw new BadRequestException({ error: { code: 'INVALID_NOTIFICATION_REQUEST' } });
    }

    const delivery = await tx.notificationDelivery.upsert({
      where: {
        type_eventKey: {
          type: NotificationDeliveryType.ORDER_CONFIRMATION,
          eventKey: input.eventKey,
        },
      },
      create: {
        externalOrderId: input.orderId,
        customerId: input.customerId,
        type: NotificationDeliveryType.ORDER_CONFIRMATION,
        eventKey: input.eventKey,
        recipientEmailEncrypted: Buffer.from(input.recipientEmailEncrypted),
        payloadVersion: input.payloadVersion,
        payloadSnapshot: input.payloadSnapshot,
        state: 'PENDING',
      },
      update: {},
    });

    if (delivery.externalOrderId !== input.orderId || delivery.customerId !== input.customerId
      || delivery.type !== NotificationDeliveryType.ORDER_CONFIRMATION
      || delivery.payloadVersion !== input.payloadVersion
      || !isDeepStrictEqual(delivery.payloadSnapshot, input.payloadSnapshot)) {
      throw new ConflictException({ error: { code: 'NOTIFICATION_EVENT_KEY_CONFLICT' } });
    }
    return delivery;
  }

  /** Persist one already-authenticated and normalized H-05 event; never call this from an unauthenticated route. */
  async enqueueShipmentUpdate(
    tx: import('@prisma/client').Prisma.TransactionClient,
    input: EnqueueShipmentUpdateInput,
  ) {
    if (!input.orderId.trim() || !input.customerId.trim()
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.shipmentEventId)
      || !(input.recipientEmailEncrypted instanceof Uint8Array) || input.recipientEmailEncrypted.byteLength === 0) {
      throw new BadRequestException({ error: { code: 'INVALID_SHIPMENT_NOTIFICATION' } });
    }
    const delivery = await tx.notificationDelivery.upsert({
      where: {
        type_eventKey: {
          type: NotificationDeliveryType.SHIPMENT_UPDATE,
          eventKey: input.shipmentEventId,
        },
      },
      create: {
        externalOrderId: input.orderId,
        customerId: input.customerId,
        type: NotificationDeliveryType.SHIPMENT_UPDATE,
        eventKey: input.shipmentEventId,
        recipientEmailEncrypted: Buffer.from(input.recipientEmailEncrypted),
        payloadVersion: 'C-002-v1',
        payloadSnapshot: input.payloadSnapshot,
        state: 'PENDING',
      },
      update: {},
    });
    if (delivery.externalOrderId !== input.orderId || delivery.customerId !== input.customerId
      || delivery.type !== NotificationDeliveryType.SHIPMENT_UPDATE
      || delivery.payloadVersion !== 'C-002-v1'
      || !isDeepStrictEqual(delivery.payloadSnapshot, input.payloadSnapshot)) {
      throw new ConflictException({ error: { code: 'NOTIFICATION_EVENT_KEY_CONFLICT' } });
    }
    return delivery;
  }
}
