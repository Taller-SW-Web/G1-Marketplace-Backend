import 'reflect-metadata';
import { CartState, CheckoutOperationState, Prisma } from '@prisma/client';
import { validateTestDatabase } from '../scripts/test-database';
import { PrismaService } from '../src/prisma/prisma.service';
import { SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';
import { CheckoutService } from '../src/checkout/checkout.service';
import { QuotesService } from '../src/checkout/quotes.service';
import { MarketplaceGateway } from '../src/checkout/external/marketplace.gateway';
import { CheckoutQuote } from '../src/checkout/checkout.types';

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
const preparedQuote = (quoteId: string): CheckoutQuote => ({
  quoteId,
  expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  subtotal: { amount: 340, currency: 'PEN' },
  discount: { amount: 0, currency: 'PEN' },
  shipping: { amount: 15, currency: 'PEN', estimatedDays: 2 },
  total: { amount: 355, currency: 'PEN' },
  lines: [{ sku: 'CHECKOUT-INTEGRATION-SKU', quantity: 2 }],
  addressId: 'ADR-INTEGRATION',
  cartVersion: 8,
});

describe('CheckoutOperation PostgreSQL 16 integration (provider MOCK)', () => {
  let prisma: PrismaService;
  let quotes: QuotesService;
  let service: CheckoutService;
  let gateway: jest.Mocked<Pick<MarketplaceGateway, 'revalidate'>>;
  let cartA: string;
  let cartB: string;

  async function createCart(customerId: string): Promise<string> {
    const cart = await prisma.cart.create({
      data: {
        customerId,
        state: CartState.ACTIVE,
        version: 8,
        items: { create: [{ sku: 'CHECKOUT-INTEGRATION-SKU', quantity: 2 }] },
      },
    });
    return cart.id;
  }

  async function clean(): Promise<void> {
    if (!prisma) return;
    const owners = [customerA, customerB];
    await prisma.checkoutOperation.deleteMany({ where: { customerId: { in: owners } } });
    await prisma.cartItem.deleteMany({ where: { cart: { customerId: { in: owners } } } });
    await prisma.cart.deleteMany({ where: { customerId: { in: owners } } });
    quotes?.invalidate(customerA);
    quotes?.invalidate(customerB);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    quotes = new QuotesService();
    gateway = {
      revalidate: jest.fn().mockResolvedValue({ available: true, revalidatedAt: new Date().toISOString() }),
    };
    service = new CheckoutService(prisma, gateway as unknown as MarketplaceGateway, quotes);
  });

  beforeEach(async () => {
    await clean();
    jest.clearAllMocks();
    gateway.revalidate.mockResolvedValue({ available: true, revalidatedAt: new Date().toISOString() });
    cartA = await createCart(customerA);
    cartB = await createCart(customerB);
    quotes.replace(customerA, preparedQuote('Q-INTEGRATION-A'));
    quotes.replace(customerB, preparedQuote('Q-INTEGRATION-B'));
  });

  afterAll(async () => {
    await clean();
    await prisma?.$disconnect();
  });

  it('runs against PostgreSQL 16', async () => {
    const rows = await prisma.$queryRaw<Array<{ server_version: string }>>`SHOW server_version`;
    expect(rows[0]?.server_version).toMatch(/^16\./);
  });

  it('persists PREPARED only after revalidation, with no order or payment result', async () => {
    const input = { quoteId: 'Q-INTEGRATION-A', cartVersion: 8, simulationConfirmed: true };
    const result = await service.prepare(customerA, input, preparationKey);
    const row = await prisma.checkoutOperation.findUniqueOrThrow({
      where: { customerId_idempotencyKey: { customerId: customerA, idempotencyKey: preparationKey } },
    });

    expect(result).toMatchObject({ state: 'PREPARED', simulationConsent: 'RECORDED' });
    expect(result).not.toHaveProperty('orderId');
    expect(row).toMatchObject({
      customerId: customerA,
      cartId: cartA,
      state: CheckoutOperationState.PREPARED,
      preparedQuoteId: 'Q-INTEGRATION-A',
      preparedCartVersion: 8,
      preparedAddressId: 'ADR-INTEGRATION',
      preparedTotalCurrency: 'PEN',
      orderIdempotencyKey: null,
      externalOrderId: null,
      failureCode: null,
    });
    expect(row.revalidatedAt).toBeInstanceOf(Date);
    expect(row.preparedLines).toEqual([{ sku: 'CHECKOUT-INTEGRATION-SKU', quantity: 2 }]);
    expect(gateway.revalidate).toHaveBeenCalledTimes(1);

    const replay = await service.prepare(customerA, input, preparationKey);
    expect(replay.checkoutOperationId).toBe(result.checkoutOperationId);
    expect(await prisma.checkoutOperation.count({ where: { customerId: customerA } })).toBe(1);
    await expect(service.prepare(customerA, { ...input, cartVersion: 7 }, preparationKey))
      .rejects.toMatchObject({ response: { error: { code: 'IDEMPOTENCY_KEY_REUSED' } } });
  });

  it('serializes concurrent requests with the same owner and key into one persisted operation', async () => {
    const input = { quoteId: 'Q-INTEGRATION-A', cartVersion: 8, simulationConfirmed: true };
    const results = await Promise.all(Array.from({ length: 8 }, () =>
      service.prepare(customerA, input, preparationKey)));

    expect(new Set(results.map((result) => result.checkoutOperationId)).size).toBe(1);
    expect(results.every((result) => result.state === 'PREPARED')).toBe(true);
    expect(await prisma.checkoutOperation.count({ where: { customerId: customerA } })).toBe(1);
    expect(await prisma.checkoutOperation.count({ where: { idempotencyKey: preparationKey } })).toBe(1);
  });

  it('scopes identical idempotency keys to their owners and prevents cross-owner operation access', async () => {
    const inputA = { quoteId: 'Q-INTEGRATION-A', cartVersion: 8, simulationConfirmed: true };
    const inputB = { quoteId: 'Q-INTEGRATION-B', cartVersion: 8, simulationConfirmed: true };
    const [resultA, resultB] = await Promise.all([
      service.prepare(customerA, inputA, preparationKey),
      service.prepare(customerB, inputB, preparationKey),
    ]);

    expect(resultA.checkoutOperationId).not.toBe(resultB.checkoutOperationId);
    const rows = await prisma.checkoutOperation.findMany({ where: { idempotencyKey: preparationKey } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.customerId).sort()).toEqual([customerA, customerB].sort());
    expect(rows.find((row) => row.customerId === customerA)?.cartId).toBe(cartA);
    expect(rows.find((row) => row.customerId === customerB)?.cartId).toBe(cartB);
    await expect(service.getOperation(customerA, resultB.checkoutOperationId))
      .rejects.toMatchObject({ response: { error: { code: 'OPERATION_NOT_FOUND' } } });
  });

  it('enforces unique owner-scoped preparation and order idempotency keys', async () => {
    const first = await prisma.checkoutOperation.create({
      data: {
        customerId: customerA,
        cartId: cartA,
        idempotencyKey: preparationKey,
        requestFingerprint: 'a'.repeat(64),
        orderIdempotencyKey: '66666666-6666-4666-8666-666666666666',
      },
    });
    await expect(prisma.checkoutOperation.create({
      data: {
        customerId: customerA,
        cartId: cartA,
        idempotencyKey: preparationKey,
        requestFingerprint: 'b'.repeat(64),
      },
    })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.checkoutOperation.create({
      data: {
        customerId: customerA,
        cartId: cartA,
        idempotencyKey: '77777777-7777-4777-8777-777777777777',
        requestFingerprint: 'c'.repeat(64),
        orderIdempotencyKey: first.orderIdempotencyKey,
      },
    })).rejects.toMatchObject({ code: 'P2002' });

    const otherOwner = await prisma.checkoutOperation.create({
      data: {
        customerId: customerB,
        cartId: cartB,
        idempotencyKey: preparationKey,
        requestFingerprint: 'd'.repeat(64),
      },
    });
    expect(otherOwner.customerId).toBe(customerB);
  });

  it('enforces fingerprint, complete prepared-context and cart foreign-key constraints', async () => {
    const base = {
      customerId: customerA,
      cartId: cartA,
      idempotencyKey: preparationKey,
      requestFingerprint: 'a'.repeat(64),
    };
    await expect(prisma.checkoutOperation.create({
      data: { ...base, requestFingerprint: 'not-a-sha256-fingerprint' },
    })).rejects.toMatchObject({ code: 'P2004' });

    await expect(prisma.checkoutOperation.create({
      data: { ...base, preparedQuoteId: 'Q-PARTIAL' },
    })).rejects.toMatchObject({ code: 'P2004' });

    await expect(prisma.checkoutOperation.create({
      data: {
        ...base,
        preparedQuoteId: 'Q-INVALID-CURRENCY',
        preparedCartVersion: 8,
        preparedAddressId: 'ADR-INTEGRATION',
        preparedExpiresAt: new Date(Date.now() + 60_000),
        preparedTotalAmount: new Prisma.Decimal(10),
        preparedTotalCurrency: 'USD',
        preparedLines: [{ sku: 'CHECKOUT-INTEGRATION-SKU', quantity: 2 }],
      },
    })).rejects.toMatchObject({ code: 'P2004' });

    const operation = await prisma.checkoutOperation.create({ data: base });
    await expect(prisma.cart.delete({ where: { id: cartA } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await prisma.checkoutOperation.findUnique({ where: { id: operation.id } })).not.toBeNull();
  });

  it('rolls back an interrupted operation transaction without leaving a partial row', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await tx.checkoutOperation.create({
        data: {
          customerId: customerA,
          cartId: cartA,
          idempotencyKey: preparationKey,
          requestFingerprint: 'e'.repeat(64),
        },
      });
      throw new Error('CHECKOUT_INTEGRATION_FORCE_ROLLBACK');
    })).rejects.toThrow('CHECKOUT_INTEGRATION_FORCE_ROLLBACK');

    expect(await prisma.checkoutOperation.count({ where: { customerId: customerA } })).toBe(0);
  });
});
