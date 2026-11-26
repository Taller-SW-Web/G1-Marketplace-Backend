import { CheckoutOperationState, NotificationDeliveryState, NotificationDeliveryType } from '@prisma/client';
import { CheckoutService } from '../src/checkout/checkout.service';
import type { SalesOrder } from '../src/checkout/checkout.types';
import type { MarketplaceGateway } from '../src/checkout/external/marketplace.gateway';
import { QuotesService } from '../src/checkout/quotes.service';
import { C001QaService, completeC001QaOperation, processC001QaDelivery } from '../src/notifications/c001-qa.service';
import { createConfiguredCommercialMailTransport } from '../src/notifications/commercial-mail-transport';
import { PrismaService } from '../src/prisma/prisma.service';

const C001 = NotificationDeliveryType.ORDER_CONFIRMATION;
const customerId = 'c0010000-0000-4000-8000-000000000001';
const operationId = 'c0010000-0000-4000-8000-000000000002';
const orderId = 'PED-2026-00001';
const order: SalesOrder = {
  pedidoId: orderId, estado: 'PAGADO', total: { amount: 139.90, currency: 'PEN' },
  createdAt: '2026-11-26T15:00:00.000Z',
};
const settings = {
  operationId,
  to: 'comprador-qa@example.org',
  key: Buffer.alloc(32, 1),
  webOrigin: 'https://marketplace.example.org',
};

const postgresSuite = process.env.RUN_H5_WEBHOOK_POSTGRES === 'true' ? describe : describe.skip;

postgresSuite('C-001 QA — checkout and delivery in disposable PostgreSQL', () => {
  const prisma = new PrismaService();
  let cartId: string;
  beforeEach(async () => {
    const cart = await prisma.cart.create({ data: { customerId } });
    cartId = cart.id;
    await prisma.checkoutOperation.create({
      data: {
        id: operationId, cartId, customerId, requestFingerprint: 'a'.repeat(64),
        idempotencyKey: 'test-c001', orderIdempotencyKey: 'test-c001-submit',
        externalOrderId: orderId, state: CheckoutOperationState.SUBMITTED,
      },
    });
  });

  afterEach(async () => {
    await prisma.notificationDelivery.deleteMany({ where: { type: C001, customerId } });
    await prisma.checkoutOperation.deleteMany({ where: { id: operationId } });
    if (cartId) await prisma.cart.delete({ where: { id: cartId } });
    jest.restoreAllMocks();
  });
  afterAll(async () => prisma.$disconnect());

  function stubBrevo(response: () => Response) {
    const fetchImpl = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async () => response());
    const transport = createConfiguredCommercialMailTransport({
      MAIL_PROVIDER: 'brevo',
      BREVO_ENABLED: 'true',
      BREVO_API_KEY: 'unit-test-only',
      BREVO_SENDER_EMAIL: 'marketplace-qa@example.org',
    }, fetchImpl);
    return { fetchImpl, transport };
  }

  it('processes two simultaneous checkout confirmations as one delivery and one provider call', async () => {
    let requests = 0;
    let open: () => void = () => {};
    const barrier = new Promise<void>(resolve => { open = resolve; });
    const getOrder = jest.fn(async (_orderId: string, _bearer?: string) => {
      requests += 1;
      if (requests === 2) open();
      await barrier;
      return order;
    });
    const gateway = { usesG5Sales: () => true, getOrder } as unknown as MarketplaceGateway;
    const qa = new C001QaService(prisma);
    jest.spyOn(qa, 'isEnabledFor').mockImplementation(id => id === settings.operationId);
    jest.spyOn(qa, 'completePaidOperation').mockImplementation((op, paid, at) =>
      completeC001QaOperation(prisma, settings, op, paid, at));
    const checkout = new CheckoutService(prisma, gateway, new QuotesService(), qa);

    const results = await Promise.all([
      checkout.getOperation(customerId, operationId, undefined, 'qa-bearer-placeholder'),
      checkout.getOperation(customerId, operationId, undefined, 'qa-bearer-placeholder'),
    ]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(getOrder.mock.calls).toEqual([
      [orderId, 'qa-bearer-placeholder'],
      [orderId, 'qa-bearer-placeholder'],
    ]);
    const persisted = await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operationId } });
    expect(persisted.state).toBe('SUCCEEDED');
    const rows = await prisma.notificationDelivery.findMany({ where: { type: C001, customerId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: C001, eventKey: `c001:${orderId}`, externalOrderId: orderId, attemptCount: 0,
      confirmationSnapshot: {
        checkoutOperationId: operationId, completedAt: persisted.completedAt?.toISOString(), totalCents: 13990,
      },
    });
    expect(Buffer.from(rows[0].recipientEmailEncrypted).includes(Buffer.from(settings.to))).toBe(false);

    const providerId = '<qa-c001@provider.example.org>';
    const { fetchImpl, transport } = stubBrevo(() => Response.json({ messageId: providerId }, { status: 201 }));
    const queue = prisma.notificationDelivery;
    const processed = await Promise.all([
      processC001QaDelivery(queue, settings, transport),
      processC001QaDelivery(queue, settings, transport),
    ]);
    expect(processed.filter(result => result.status === 'sent')).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({
      to: [{ email: settings.to }],
      textContent: expect.stringContaining('Fecha de confirmación'),
    });
    expect(payload.textContent).toContain('139.90');
    expect(payload.textContent).not.toContain('1 ×');
    await expect(queue.findUnique({ where: { id: rows[0].id } })).resolves.toMatchObject({
      state: NotificationDeliveryState.SENT,
      attemptCount: 1,
      providerMessageId: providerId,
      sentAt: expect.any(Date),
    });
  });

  it('keeps external order IDs forbidden before submission', async () => {
    await expect(prisma.checkoutOperation.update({
      where: { id: operationId },
      data: { state: CheckoutOperationState.PREPARED },
    })).rejects.toThrow('checkout_operations_result_chk');
  });

  it('recovers a paid order through status reads after the outbox insert fails', async () => {
    const getOrder = jest.fn(async () => order);
    const createOrder = jest.fn();
    const gateway = { usesG5Sales: () => true, getOrder, createOrder } as unknown as MarketplaceGateway;
    // Exercise the real confirmation transaction without starting the background Brevo worker.
    const qa = Object.assign(new C001QaService(prisma), { settings });
    const checkout = new CheckoutService(prisma, gateway, new QuotesService(), qa);
    const readStatus = () => checkout.getOperation(customerId, operationId, undefined, 'qa-bearer-placeholder');
    const queue = prisma.notificationDelivery;
    const { fetchImpl, transport } = stubBrevo(() =>
      Response.json({ messageId: '<qa-retry-c001@provider.example.org>' }, { status: 201 }));

    await prisma.$executeRaw`
      ALTER TABLE "notification_deliveries"
      ADD CONSTRAINT "c001_test_reject_outbox" CHECK ("type" <> 'ORDER_CONFIRMATION') NOT VALID
    `;
    try {
      await expect(readStatus()).rejects.toMatchObject({
        status: 503,
        response: { error: { code: 'C001_QA_CONFIRMATION_UNAVAILABLE' } },
      });
      await expect(prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operationId } })).resolves.toMatchObject({
        state: CheckoutOperationState.SUBMITTED,
        externalOrderId: orderId,
        completedAt: null,
      });
      await expect(queue.count({ where: { type: C001, customerId } })).resolves.toBe(0);
      await expect(processC001QaDelivery(queue, settings, transport)).resolves.toEqual({ status: 'idle' });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      await prisma.$executeRaw`ALTER TABLE "notification_deliveries" DROP CONSTRAINT "c001_test_reject_outbox"`;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await expect(readStatus()).resolves.toMatchObject({
        status: 200,
        data: { state: CheckoutOperationState.SUCCEEDED, order: { orderId, state: 'PAGADO' } },
      });
    }
    expect(createOrder).not.toHaveBeenCalled();
    expect(getOrder.mock.calls).toEqual(Array.from({ length: 3 }, () => [orderId, 'qa-bearer-placeholder']));
    const deliveries = await queue.findMany({ where: { type: C001, customerId } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ eventKey: `c001:${orderId}`, attemptCount: 0 });
    await expect(processC001QaDelivery(queue, settings, transport)).resolves.toMatchObject({ status: 'sent' });
    await expect(processC001QaDelivery(queue, settings, transport)).resolves.toEqual({ status: 'idle' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(queue.findUniqueOrThrow({ where: { id: deliveries[0].id } })).resolves.toMatchObject({
      state: NotificationDeliveryState.SENT,
      attemptCount: 1,
      providerMessageId: '<qa-retry-c001@provider.example.org>',
    });
  });

  it('rejects unpaid or mismatched Sales orders and does not queue them', async () => {
    const operation = { id: operationId, customerId, externalOrderId: orderId };
    for (const other of [
      { ...order, estado: 'CREADO' as const },
      { ...order, pedidoId: 'PED-2026-00002' },
    ]) {
      await expect(completeC001QaOperation(prisma, settings, operation, other, new Date())).rejects.toThrow();
    }
    expect(await prisma.notificationDelivery.count({ where: { type: C001, customerId } })).toBe(0);
  });

  it('keeps an uncertain attempt unsent and avoids a second request', async () => {
    const operation = await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operationId } });
    await completeC001QaOperation(prisma, settings, operation, order, new Date());
    const { fetchImpl, transport } = stubBrevo(() => Response.json({}, { status: 503 }));
    const queue = prisma.notificationDelivery;
    await expect(processC001QaDelivery(queue, settings, transport)).resolves.toMatchObject({ status: 'unconfirmed' });
    await expect(processC001QaDelivery(queue, settings, transport)).resolves.toEqual({ status: 'idle' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(queue.findFirst({ where: { type: C001, customerId } })).resolves.toMatchObject({
      state: NotificationDeliveryState.PENDING, attemptCount: 1, sentAt: null, providerMessageId: null,
    });
  });
});
