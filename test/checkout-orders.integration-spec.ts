import 'reflect-metadata';
import { CartState, CheckoutOperationState, Prisma } from '@prisma/client';
import { validateTestDatabase } from '../scripts/test-database';
import { SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';
import { PrismaService } from '../src/prisma/prisma.service';
import { CheckoutService } from '../src/checkout/checkout.service';
import { CheckoutContactDto } from '../src/checkout/dto/contact.dto';
import { CheckoutOperationView, SalesOrder } from '../src/checkout/checkout.types';
import { MarketplaceGateway } from '../src/checkout/external/marketplace.gateway';
import { QuotesService } from '../src/checkout/quotes.service';

if (process.env.H3_ALLOW_TEST_DATABASE_WRITES !== 'true') {
  throw new Error('Database writes are disabled');
}
const databaseUrl = validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL });
if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== databaseUrl) {
  throw new Error('Use npm run test:integration with an isolated database');
}

const customerA = SANDBOX_CUSTOMERS.A;
const customerB = SANDBOX_CUSTOMERS.B;
const preparationKey = '55555555-5555-4555-8555-555555555555';
const orderKey = '66666666-6666-4666-8666-666666666666';
const contact: CheckoutContactDto = {
  fullName: 'Checkout Integration',
  documentType: 'DNI',
  documentNumber: '12345678',
  phone: '999999999',
  email: 'checkout-integration@example.test',
};
const salesOrder = (estado: SalesOrder['estado'], pedidoId = 'PED-2026-12345'): SalesOrder => ({
  pedidoId,
  estado,
  total: { amount: 355, currency: 'PEN' },
  createdAt: new Date().toISOString(),
  ...(estado === 'ANULADO' ? { failureCode: 'PAGO_NO_COMPLETADO' } : {}),
});

describe('Checkout order PostgreSQL 16 integration (Sales MOCK)', () => {
  let prisma: PrismaService;
  let quotes: QuotesService;
  let service: CheckoutService;
  let gateway: jest.Mocked<Pick<MarketplaceGateway,
    'createOrder' | 'getOrder' | 'getOrderByIdempotencyKey'>>;
  let cartA: string;
  let cartB: string;

  async function createCart(customerId: string): Promise<string> {
    const cart = await prisma.cart.create({
      data: { customerId, state: CartState.ACTIVE, version: 8 },
    });
    return cart.id;
  }

  async function seedPreparedOperation(
    customerId = customerA,
    cartId = cartA,
    operationIdempotencyKey = preparationKey,
  ) {
    return prisma.checkoutOperation.create({
      data: {
        customerId,
        cartId,
        idempotencyKey: operationIdempotencyKey,
        requestFingerprint: 'a'.repeat(64),
        state: CheckoutOperationState.PREPARED,
        preparedQuoteId: 'Q-CHECKOUT-INTEGRATION',
        preparedCartVersion: 8,
        preparedAddressId: 'ADR-CHECKOUT-INTEGRATION',
        preparedExpiresAt: new Date(Date.now() + 5 * 60_000),
        preparedTotalAmount: new Prisma.Decimal(355),
        preparedTotalCurrency: 'PEN',
        preparedLines: [{ sku: 'CHECKOUT-INTEGRATION-SKU', quantity: 1 }],
        revalidatedAt: new Date(),
      },
    });
  }

  async function clean(): Promise<void> {
    if (!prisma) return;
    const owners = [customerA, customerB];
    await prisma.checkoutOperation.deleteMany({ where: { customerId: { in: owners } } });
    await prisma.cartItem.deleteMany({ where: { cart: { customerId: { in: owners } } } });
    await prisma.cart.deleteMany({ where: { customerId: { in: owners } } });
  }

  function submit(customerId: string, operationId: string, key = orderKey) {
    return service.createOrder(customerId, { checkoutOperationId: operationId, contact }, key);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    quotes = new QuotesService();
    gateway = {
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      getOrderByIdempotencyKey: jest.fn(),
    };
    service = new CheckoutService(prisma, gateway as unknown as MarketplaceGateway, quotes);
  });

  beforeEach(async () => {
    await clean();
    jest.clearAllMocks();
    gateway.createOrder.mockResolvedValue(salesOrder('CREADO'));
    gateway.getOrderByIdempotencyKey.mockResolvedValue(salesOrder('CREADO'));
    gateway.getOrder.mockResolvedValue(salesOrder('PAGADO'));
    cartA = await createCart(customerA);
    cartB = await createCart(customerB);
  });

  afterAll(async () => {
    await clean();
    await prisma?.$disconnect();
  });

  it('runs against PostgreSQL 16', async () => {
    const rows = await prisma.$queryRaw<Array<{ server_version: string }>>`SHOW server_version`;
    expect(rows[0]?.server_version).toMatch(/^16\./);
  });

  it('persists SUBMITTED and recovers CREADO without storing contact or treating it as success', async () => {
    const operation = await seedPreparedOperation();
    const created = salesOrder('CREADO');
    gateway.createOrder.mockResolvedValue(created);
    gateway.getOrderByIdempotencyKey.mockResolvedValue(created);

    const result = await submit(customerA, operation.id);
    const persisted = await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operation.id } });

    expect(result.status).toBe(202);
    expect(result.data).toMatchObject({ state: 'SUBMITTED', orderState: 'CREADO', orderId: created.pedidoId });
    expect(persisted).toMatchObject({
      customerId: customerA,
      cartId: cartA,
      state: CheckoutOperationState.SUBMITTED,
      orderIdempotencyKey: orderKey,
      externalOrderId: null,
    });
    expect(persisted.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(persisted)).not.toContain(contact.email);
    expect(JSON.stringify(persisted)).not.toContain(contact.documentNumber);
    expect(gateway.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      customerId: customerA,
      checkoutOperationId: operation.id,
      idempotencyKey: orderKey,
    }));

    const status = await service.getOperation(customerA, operation.id);
    expect(status).toMatchObject({
      status: 202,
      data: {
        state: 'SUBMITTED',
        order: { orderId: created.pedidoId, state: 'CREADO', total: created.total },
      },
    });
    expect((await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operation.id } })).state)
      .toBe(CheckoutOperationState.SUBMITTED);
  });

  it('marks an operation SUCCEEDED only after the persisted order lookup confirms PAGADO', async () => {
    const operation = await seedPreparedOperation();
    const paid = salesOrder('PAGADO');
    gateway.createOrder.mockResolvedValue(salesOrder('CREADO'));
    gateway.getOrderByIdempotencyKey.mockResolvedValue(paid);
    gateway.getOrder.mockResolvedValue(paid);

    const result = await submit(customerA, operation.id);
    const row = await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operation.id } });
    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ state: 'SUCCEEDED', orderState: 'PAGADO', orderId: paid.pedidoId });
    expect(row).toMatchObject({
      state: CheckoutOperationState.SUCCEEDED,
      externalOrderId: paid.pedidoId,
      orderIdempotencyKey: orderKey,
    });
    const status = await service.getOperation(customerA, operation.id);
    expect(status).toMatchObject({
      status: 200,
      data: { state: 'SUCCEEDED', order: { orderId: paid.pedidoId, state: 'PAGADO' } },
    });
  });

  it('returns 409 for a persisted terminal failure on operation lookup', async () => {
    const operation = await seedPreparedOperation();
    gateway.getOrderByIdempotencyKey.mockResolvedValue(salesOrder('ANULADO'));

    const result = await submit(customerA, operation.id);
    expect(result.data).toMatchObject({ state: 'FAILED', failureCode: 'PAGO_NO_COMPLETADO' });
    await expect(service.getOperation(customerA, operation.id)).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'PAGO_NO_COMPLETADO' } },
    });
  });

  it('keeps an uncertain Sales creation recoverable with the same key after a service restart', async () => {
    const operation = await seedPreparedOperation();
    gateway.createOrder
      .mockRejectedValueOnce({ status: 503, code: 'SALES_UNAVAILABLE' })
      .mockResolvedValueOnce(salesOrder('CREADO'));
    gateway.getOrderByIdempotencyKey.mockResolvedValue(salesOrder('CREADO'));

    await expect(submit(customerA, operation.id)).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'ORDER_CREATION_PENDING' } },
    });
    const pending = await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operation.id } });
    expect(pending.state).toBe(CheckoutOperationState.SUBMITTED);
    expect(pending.orderIdempotencyKey).toBe(orderKey);

    service = new CheckoutService(prisma, gateway as unknown as MarketplaceGateway, quotes);
    const recovered = await submit(customerA, operation.id);
    expect(recovered.status).toBe(202);
    expect(gateway.createOrder).toHaveBeenNthCalledWith(1, expect.objectContaining({ idempotencyKey: orderKey }));
    expect(gateway.createOrder).toHaveBeenNthCalledWith(2, expect.objectContaining({ idempotencyKey: orderKey }));
    expect(await prisma.checkoutOperation.count({ where: { customerId: customerA } })).toBe(1);
  });

  it('does not expose another owner operation and does not call Sales on unauthorized access', async () => {
    const operation = await seedPreparedOperation(customerA, cartA);
    await expect(service.getOperation(customerB, operation.id)).rejects.toMatchObject({
      response: { error: { code: 'OPERATION_NOT_FOUND' } },
    });
    await expect(submit(customerB, operation.id)).rejects.toMatchObject({
      response: { error: { code: 'OPERATION_NOT_FOUND' } },
    });
    expect(gateway.getOrder).not.toHaveBeenCalled();
    expect(gateway.getOrderByIdempotencyKey).not.toHaveBeenCalled();
    expect(gateway.createOrder).not.toHaveBeenCalled();
  });

  it('rejects a second operation claiming the same owner-scoped Sales idempotency key', async () => {
    const first = await seedPreparedOperation();
    const second = await seedPreparedOperation(customerA, cartA, '77777777-7777-4777-8777-777777777777');
    gateway.getOrderByIdempotencyKey.mockResolvedValue(salesOrder('CREADO'));

    await submit(customerA, first.id);
    await expect(submit(customerA, second.id)).rejects.toMatchObject({
      status: 409,
      response: { error: { code: 'IDEMPOTENCY_KEY_REUSED' } },
    });
    expect((await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: second.id } })).state)
      .toBe(CheckoutOperationState.PREPARED);
  });

  it('serializes concurrent submissions to one persisted state and uses the same provider key', async () => {
    const operation = await seedPreparedOperation();
    gateway.getOrderByIdempotencyKey.mockResolvedValue(salesOrder('CREADO'));
    const results = await Promise.all(Array.from({ length: 6 }, () => submit(customerA, operation.id)));

    expect(results.every((result) => result.status === 202 && result.data.state === 'SUBMITTED')).toBe(true);
    expect(await prisma.checkoutOperation.count({ where: { customerId: customerA } })).toBe(1);
    expect(gateway.createOrder).toHaveBeenCalled();
    expect(gateway.createOrder.mock.calls.every(([input]) => input.idempotencyKey === orderKey)).toBe(true);
    const row = await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operation.id } });
    expect(row).toMatchObject({ state: CheckoutOperationState.SUBMITTED, orderIdempotencyKey: orderKey });
  });

  it('rolls back an interrupted database transaction without changing the order state', async () => {
    const operation = await seedPreparedOperation();
    await expect(prisma.$transaction(async (tx) => {
      await tx.checkoutOperation.update({
        where: { id: operation.id },
        data: { state: CheckoutOperationState.SUBMITTED, orderIdempotencyKey: orderKey },
      });
      throw new Error('CHECKOUT_ORDER_FORCE_ROLLBACK');
    })).rejects.toThrow('CHECKOUT_ORDER_FORCE_ROLLBACK');

    const persisted = await prisma.checkoutOperation.findUniqueOrThrow({ where: { id: operation.id } });
    expect(persisted.state).toBe(CheckoutOperationState.PREPARED);
    expect(persisted.orderIdempotencyKey).toBeNull();
  });
});
