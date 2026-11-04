import { ConflictException } from '@nestjs/common';
import { NotificationDeliveryType } from '@prisma/client';
import { NotificationOutboxService } from './notification-outbox.service';
import { RecipientEmailCipher } from './recipient-email-cipher';

describe('NotificationOutboxService', () => {
  const input = {
    orderId: 'ORDER-FIXTURE-001',
    customerId: '11111111-1111-4111-8111-111111111111',
    eventKey: 'order-paid:ORDER-FIXTURE-001',
    recipientEmailEncrypted: new RecipientEmailCipher(Buffer.from('0123456789abcdef0123456789abcdef', 'utf8'))
      .encrypt('fernando@example.test'),
    payloadVersion: 'C-001-v1',
    payloadSnapshot: { orderId: 'ORDER-FIXTURE-001', orderState: 'PAGADO' },
    verifiedOrderState: 'PAGADO',
  };
  let tx: { notificationDelivery: { upsert: jest.Mock } };
  let service: NotificationOutboxService;

  beforeEach(() => {
    tx = { notificationDelivery: { upsert: jest.fn() } };
    service = new NotificationOutboxService();
  });

  it('creates a pending encrypted outbox item only for a verified paid order', async () => {
    const delivery = { id: 'fixture-delivery', externalOrderId: input.orderId, customerId: input.customerId,
      type: NotificationDeliveryType.ORDER_CONFIRMATION, state: 'PENDING', payloadVersion: input.payloadVersion,
      payloadSnapshot: input.payloadSnapshot };
    tx.notificationDelivery.upsert.mockResolvedValue(delivery);

    await expect(service.enqueueOrderConfirmation(tx as never, input)).resolves.toBe(delivery);
    expect(tx.notificationDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { type_eventKey: { type: NotificationDeliveryType.ORDER_CONFIRMATION, eventKey: input.eventKey } },
      create: expect.objectContaining({
        externalOrderId: input.orderId,
        customerId: input.customerId,
        recipientEmailEncrypted: input.recipientEmailEncrypted,
        payloadSnapshot: input.payloadSnapshot,
        state: 'PENDING',
      }),
      update: {},
    }));
  });

  it('does not enqueue while Sales has not verified PAGADO', async () => {
    await expect(service.enqueueOrderConfirmation(tx as never, { ...input, verifiedOrderState: 'CREADO' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.notificationDelivery.upsert).not.toHaveBeenCalled();
  });

  it('returns the existing logical delivery on duplicate event key', async () => {
    const existing = { id: 'fixture-delivery', externalOrderId: input.orderId, customerId: input.customerId,
      type: NotificationDeliveryType.ORDER_CONFIRMATION, state: 'PENDING', payloadVersion: input.payloadVersion,
      payloadSnapshot: input.payloadSnapshot };
    tx.notificationDelivery.upsert.mockResolvedValue(existing);
    await expect(service.enqueueOrderConfirmation(tx as never, input)).resolves.toBe(existing);
    expect(tx.notificationDelivery.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of an event key for a different order or customer', async () => {
    tx.notificationDelivery.upsert.mockResolvedValue({
      id: 'fixture-delivery',
      externalOrderId: 'ORDER-OTHER',
      customerId: input.customerId,
      type: NotificationDeliveryType.ORDER_CONFIRMATION,
    });
    await expect(service.enqueueOrderConfirmation(tx as never, input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects reuse of the same event key with a changed payload', async () => {
    tx.notificationDelivery.upsert.mockResolvedValue({
      id: 'fixture-delivery', externalOrderId: input.orderId, customerId: input.customerId,
      type: NotificationDeliveryType.ORDER_CONFIRMATION, payloadVersion: input.payloadVersion,
      payloadSnapshot: { orderId: input.orderId, orderState: 'PAGADO', total: 10 },
    });
    await expect(service.enqueueOrderConfirmation(tx as never, input)).rejects.toBeInstanceOf(ConflictException);
  });
});
