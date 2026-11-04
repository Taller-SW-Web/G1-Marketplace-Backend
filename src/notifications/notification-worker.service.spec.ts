import { NotificationDeliveryState, NotificationDeliveryType } from '@prisma/client';
import { NotificationEmailProvider, NotificationWorkerService } from './notification-worker.service';
import { RecipientEmailCipher } from './recipient-email-cipher';

describe('NotificationWorkerService', () => {
  const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const recipientEmailEncrypted = new RecipientEmailCipher(Buffer.from(key, 'hex')).encrypt('fernando@example.test');
  const base = {
    id: 'delivery-1',
    externalOrderId: 'PED-2026-00042',
    customerId: '11111111-1111-4111-8111-111111111111',
    type: NotificationDeliveryType.ORDER_CONFIRMATION,
    eventKey: 'order-paid:PED-2026-00042',
    recipientEmailEncrypted,
    payloadVersion: 'C-001-v1',
    payloadSnapshot: {
      orderId: 'PED-2026-00042', orderState: 'PAGADO',
      createdAt: '2026-11-04T05:30:00.000Z', total: { amount: 125.5, currency: 'PEN' },
    },
    state: NotificationDeliveryState.PENDING,
    attemptCount: 0,
    leaseToken: null,
    leaseExpiresAt: null,
    nextAttemptAt: new Date(0),
    createdAt: new Date(0),
  };
  let previous: Record<string, string | undefined>;

  beforeEach(() => {
    previous = {
      NOTIFICATION_WORKER_ENABLED: process.env.NOTIFICATION_WORKER_ENABLED,
      NOTIFICATION_EMAIL_ENCRYPTION_KEY: process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY,
      G1_WEB_ORIGIN: process.env.G1_WEB_ORIGIN,
    };
    process.env.NOTIFICATION_WORKER_ENABLED = 'true';
    process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY = key;
    process.env.G1_WEB_ORIGIN = 'https://market.example';
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });

  function setup(provider: NotificationEmailProvider, record: Record<string, unknown> = base) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest.fn()
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce({ ...record, state: NotificationDeliveryState.PROCESSING, leaseToken: 'lease-1', attemptCount: 1 });
    const prisma = { notificationDelivery: { findFirst, updateMany } };
    return { worker: new NotificationWorkerService(prisma as never, provider), findFirst, updateMany };
  }

  it('leases one pending row, decrypts only for delivery, and marks the acknowledged result sent', async () => {
    const provider: NotificationEmailProvider = {
      send: jest.fn().mockResolvedValue({ status: 'SENT', messageId: 'provider-message-1' }),
      reconcile: jest.fn(),
    };
    const { worker, updateMany } = setup(provider);
    await expect(worker.processPendingBatch(1)).resolves.toBe(1);
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({
      recipient: 'fernando@example.test', eventKey: base.eventKey,
      subject: expect.stringContaining(base.externalOrderId),
    }));
    expect(updateMany.mock.calls[1][0].data).toEqual(expect.objectContaining({
      state: NotificationDeliveryState.SENT,
      providerMessageId: 'provider-message-1',
      leaseToken: null,
    }));
  });

  it('reconciles a lost response instead of blindly sending a duplicate', async () => {
    const provider: NotificationEmailProvider = {
      send: jest.fn().mockResolvedValue({ status: 'OUTCOME_UNKNOWN', code: 'TIMEOUT' }),
      reconcile: jest.fn().mockResolvedValue({ status: 'SENT', messageId: 'reconciled-message' }),
    };
    const { worker, updateMany } = setup(provider);
    await worker.processPendingBatch(1);
    expect(provider.reconcile).toHaveBeenCalledWith(base.eventKey);
    expect(updateMany.mock.calls[1][0].data).toEqual(expect.objectContaining({
      state: NotificationDeliveryState.SENT,
      providerMessageId: 'reconciled-message',
    }));
  });

  it('schedules retryable failures with a bounded delay and stable event key', async () => {
    const provider: NotificationEmailProvider = {
      send: jest.fn().mockResolvedValue({ status: 'RETRYABLE_FAILURE', code: 'TEMPORARY_UNAVAILABLE' }),
      reconcile: jest.fn(),
    };
    const { worker, updateMany } = setup(provider);
    await worker.processPendingBatch(1);
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ eventKey: base.eventKey }));
    expect(updateMany.mock.calls[1][0].data).toEqual(expect.objectContaining({
      state: NotificationDeliveryState.PENDING,
      lastErrorCode: 'TEMPORARY_UNAVAILABLE',
      nextAttemptAt: expect.any(Date),
      leaseToken: null,
    }));
  });

  it('renders an already-authorized shipment update without exposing the tracking number', async () => {
    const record = {
      ...base,
      type: NotificationDeliveryType.SHIPMENT_UPDATE,
      eventKey: 'shipment-event:evt-42',
      payloadVersion: 'C-002-v1',
      payloadSnapshot: {
        shipmentEventId: 'evt-42', orderId: 'PED-2026-00042', publicStatus: 'DESPACHADO',
        occurredAt: '2026-11-04T05:30:00.000Z', trackingNumber: 'PRIVATE-TRACKING-VALUE',
      },
    };
    const provider: NotificationEmailProvider = {
      send: jest.fn().mockResolvedValue({ status: 'SENT', messageId: 'shipment-message-1' }),
      reconcile: jest.fn(),
    };
    const { worker } = setup(provider, record);
    await worker.processPendingBatch(1);
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: record.eventKey,
      subject: expect.stringContaining('En camino'),
      html: expect.not.stringContaining('PRIVATE-TRACKING-VALUE'),
    }));
  });

  it('parks an unresolved provider outcome for manual reconciliation', async () => {
    const provider: NotificationEmailProvider = {
      send: jest.fn().mockResolvedValue({ status: 'OUTCOME_UNKNOWN', code: 'TIMEOUT' }),
      reconcile: jest.fn().mockResolvedValue({ status: 'UNKNOWN' }),
    };
    const { worker, updateMany } = setup(provider);
    await worker.processPendingBatch(1);
    expect(updateMany.mock.calls[1][0].data).toEqual(expect.objectContaining({
      state: NotificationDeliveryState.RECONCILIATION_REQUIRED,
      lastErrorCode: 'DELIVERY_OUTCOME_UNRESOLVED',
    }));
  });

  it('does not query or send when the runtime flag is off', async () => {
    process.env.NOTIFICATION_WORKER_ENABLED = 'false';
    const provider: NotificationEmailProvider = { send: jest.fn(), reconcile: jest.fn() };
    const prisma = { notificationDelivery: { findFirst: jest.fn(), updateMany: jest.fn() } };
    const worker = new NotificationWorkerService(prisma as never, provider);
    await expect(worker.processPendingBatch()).resolves.toBe(0);
    expect(prisma.notificationDelivery.findFirst).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });
});
