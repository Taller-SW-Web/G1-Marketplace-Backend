import { CheckoutOperationState, NotificationDeliveryType } from '@prisma/client';
import { NotificationOutboxService } from './notification-outbox.service';
import { ShipmentEventConsumerService } from './shipment-event-consumer.service';

describe('ShipmentEventConsumerService', () => {
  const event = {
    shipmentEventId: 'shipment.evt-42',
    orderId: 'PED-2026-00042',
    publicStatus: 'DESPACHADO' as const,
    trackingNumber: 'PRIVATE-TRACKING-VALUE',
    occurredAt: '2026-11-04T05:30:00.000Z',
    estimatedDelivery: '2026-11-10',
  };
  const encrypted = Buffer.from('encrypted-fixture');
  let findCheckouts: jest.Mock;
  let upsertDelivery: jest.Mock;
  let prisma: { $transaction: jest.Mock };
  let service: ShipmentEventConsumerService;

  beforeEach(() => {
    findCheckouts = jest.fn().mockResolvedValue([{ customerId: 'customer-1', recipientEmailEncrypted: encrypted }]);
    upsertDelivery = jest.fn().mockImplementation(({ create }) => ({
      id: 'delivery-1', ...create,
    }));
    const tx = {
      checkoutOperation: { findMany: findCheckouts },
      notificationDelivery: { upsert: upsertDelivery },
    };
    prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    service = new ShipmentEventConsumerService(prisma as never, new NotificationOutboxService());
  });

  it('links the public event to the successful G1 order and enqueues one encrypted C-002 snapshot', async () => {
    await expect(service.persistVerifiedEvent(event)).resolves.toEqual({ queued: true, eventId: 'delivery-1' });
    expect(findCheckouts).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        externalOrderId: event.orderId,
        state: CheckoutOperationState.SUCCEEDED,
        recipientEmailEncrypted: { not: null },
      },
    }));
    expect(upsertDelivery).toHaveBeenCalledWith(expect.objectContaining({
      where: { type_eventKey: { type: NotificationDeliveryType.SHIPMENT_UPDATE, eventKey: event.shipmentEventId } },
      create: expect.objectContaining({
        recipientEmailEncrypted: encrypted,
        payloadVersion: 'C-002-v1',
        payloadSnapshot: expect.not.objectContaining({ trackingNumber: event.trackingNumber }),
      }),
    }));
  });

  it('returns the same logical receipt when the event is replayed', async () => {
    const first = await service.persistVerifiedEvent(event);
    const retry = await service.persistVerifiedEvent(event);
    expect(retry).toEqual(first);
    expect(upsertDelivery).toHaveBeenCalledTimes(2);
  });

  it('does not enqueue when no successful G1 order has an encrypted recipient', async () => {
    findCheckouts.mockResolvedValue([]);
    await expect(service.persistVerifiedEvent(event)).resolves.toEqual({ queued: false });
    expect(upsertDelivery).not.toHaveBeenCalled();
  });

  it('does not notify when the order id is ambiguously associated with multiple owners', async () => {
    findCheckouts.mockResolvedValue([
      { customerId: 'customer-1', recipientEmailEncrypted: encrypted },
      { customerId: 'customer-2', recipientEmailEncrypted: encrypted },
    ]);
    await expect(service.persistVerifiedEvent(event)).resolves.toEqual({ queued: false });
    expect(upsertDelivery).not.toHaveBeenCalled();
  });
});
