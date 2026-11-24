import { CheckoutOperationState } from '@prisma/client';
import { NotificationOutboxService } from './notification-outbox.service';
import { ShipmentEventConsumerService } from './shipment-event-consumer.service';

describe('ShipmentEventConsumerService', () => {
  const event = {
    shipmentEventId: '8ad24563-c9da-4305-b650-1dd47a14fffb',
    orderId: 'PED-2026-00042',
    publicStatus: 'DESPACHADO' as const,
    trackingNumber: 'PRIVATE-TRACKING-VALUE',
    occurredAt: '2026-11-04T05:30:00.000Z',
    estimatedDelivery: '2026-11-10',
  };
  const encrypted = Buffer.from('encrypted-fixture');
  let findCheckouts: jest.Mock;
  let findEvent: jest.Mock;
  let createEvent: jest.Mock;
  let updateEvent: jest.Mock;
  let findPendingEvents: jest.Mock;
  let enqueueShipmentUpdate: jest.Mock;
  let prisma: { $transaction: jest.Mock; shipmentWebhookEvent: { findUnique: jest.Mock } };
  let tx: Record<string, unknown>;
  let storedEvent: Record<string, unknown> | null;
  let service: ShipmentEventConsumerService;

  beforeEach(() => {
    storedEvent = null;
    findCheckouts = jest.fn().mockResolvedValue([{ customerId: 'customer-1', recipientEmailEncrypted: encrypted }]);
    findEvent = jest.fn().mockImplementation(({ where }) => Promise.resolve(
      storedEvent && storedEvent.eventId === where.eventId ? storedEvent : null,
    ));
    createEvent = jest.fn().mockImplementation(({ data }) => {
      storedEvent = { ...data };
      return Promise.resolve(storedEvent);
    });
    updateEvent = jest.fn().mockImplementation(({ data }) => {
      storedEvent = storedEvent ? { ...storedEvent, ...data } : null;
      return Promise.resolve(storedEvent);
    });
    findPendingEvents = jest.fn().mockResolvedValue([]);
    enqueueShipmentUpdate = jest.fn().mockResolvedValue({ id: 'delivery-1' });
    tx = {
      checkoutOperation: { findMany: findCheckouts },
      shipmentWebhookEvent: {
        findUnique: findEvent,
        create: createEvent,
        update: updateEvent,
        findMany: findPendingEvents,
      },
    };
    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
      shipmentWebhookEvent: { findUnique: findEvent },
    };
    const outbox = { enqueueShipmentUpdate };
    service = new ShipmentEventConsumerService(prisma as never, outbox as unknown as NotificationOutboxService);
  });

  it('persists the event and enqueues one encrypted C-002 snapshot for the successful G1 order', async () => {
    await expect(service.persistVerifiedEvent(event)).resolves.toEqual({
      accepted: true,
      duplicate: false,
      orderKnown: true,
      notificationQueued: true,
    });

    expect(findCheckouts).toHaveBeenCalledWith({
      where: {
        externalOrderId: event.orderId,
        state: CheckoutOperationState.SUCCEEDED,
      },
      select: { customerId: true, recipientEmailEncrypted: true },
      take: 2,
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: event.shipmentEventId,
        orderId: event.orderId,
        publicStatus: event.publicStatus,
        occurredAt: new Date(event.occurredAt),
        estimatedDeliveryDate: new Date('2026-11-10T00:00:00.000Z'),
        payloadFingerprint: expect.any(String),
      }),
    });
    expect(enqueueShipmentUpdate).toHaveBeenCalledWith(tx, expect.objectContaining({
      orderId: event.orderId,
      customerId: 'customer-1',
      shipmentEventId: event.shipmentEventId,
      recipientEmailEncrypted: encrypted,
      payloadSnapshot: expect.not.objectContaining({ trackingNumber: event.trackingNumber }),
    }));
    expect(updateEvent).toHaveBeenCalledWith({
      where: { eventId: event.shipmentEventId },
      data: { notificationQueuedAt: expect.any(Date) },
    });
  });

  it('accepts an identical replay as a duplicate and relies on the outbox key for deduplication', async () => {
    const first = await service.persistVerifiedEvent(event);
    const retry = await service.persistVerifiedEvent(event);

    expect(first).toEqual({ accepted: true, duplicate: false, orderKnown: true, notificationQueued: true });
    expect(retry).toEqual({ accepted: true, duplicate: true, orderKnown: true, notificationQueued: true });
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(enqueueShipmentUpdate).toHaveBeenCalledTimes(2);
  });

  it('stores an event before its order is known so it can be reconciled later', async () => {
    findCheckouts.mockResolvedValueOnce([]);

    await expect(service.persistVerifiedEvent(event)).resolves.toEqual({
      accepted: true,
      duplicate: false,
      orderKnown: false,
      notificationQueued: false,
    });
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(enqueueShipmentUpdate).not.toHaveBeenCalled();
  });

  it('reconciles a previously unknown event after the matching checkout succeeds', async () => {
    findCheckouts.mockResolvedValueOnce([]);
    await service.persistVerifiedEvent(event);
    findPendingEvents.mockResolvedValueOnce([{
      eventId: event.shipmentEventId,
      orderId: event.orderId,
      publicStatus: event.publicStatus,
      trackingNumber: event.trackingNumber,
      occurredAt: new Date(event.occurredAt),
      estimatedDeliveryDate: new Date('2026-11-10T00:00:00.000Z'),
    }]);

    await service.reconcilePendingNotifications(event.orderId);

    expect(findPendingEvents).toHaveBeenCalledWith({
      where: { orderId: event.orderId, notificationQueuedAt: null },
      orderBy: [{ occurredAt: 'asc' }, { eventId: 'asc' }],
      take: 100,
    });
    expect(enqueueShipmentUpdate).toHaveBeenCalledWith(tx, expect.objectContaining({
      orderId: event.orderId,
      shipmentEventId: event.shipmentEventId,
      recipientEmailEncrypted: encrypted,
    }));
    expect(updateEvent).toHaveBeenLastCalledWith({
      where: { eventId: event.shipmentEventId },
      data: { notificationQueuedAt: expect.any(Date) },
    });
  });

  it('does not enqueue when multiple successful checkouts match the same external order', async () => {
    findCheckouts.mockResolvedValueOnce([
      { customerId: 'customer-1', recipientEmailEncrypted: encrypted },
      { customerId: 'customer-2', recipientEmailEncrypted: encrypted },
    ]);

    await expect(service.persistVerifiedEvent(event)).resolves.toEqual({
      accepted: true,
      duplicate: false,
      orderKnown: true,
      notificationQueued: false,
    });
    expect(enqueueShipmentUpdate).not.toHaveBeenCalled();
  });

  it('rejects reuse of an event id with a different payload', async () => {
    storedEvent = { eventId: event.shipmentEventId, payloadFingerprint: 'different-payload' };

    await expect(service.persistVerifiedEvent(event)).rejects.toMatchObject({
      response: { error: { code: 'WEBHOOK_EVENT_ID_CONFLICT' } },
    });
    expect(createEvent).not.toHaveBeenCalled();
  });
});
