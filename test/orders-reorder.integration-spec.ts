import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { CartState } from '@prisma/client';
import { validateTestDatabase } from '../scripts/test-database';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { ReorderService } from '../src/orders/reorder.service';
import { ReorderCommerceProvider } from '../src/orders/reorder.types';

if (process.env.H3_ALLOW_TEST_DATABASE_WRITES !== 'true') throw new Error('Database writes are disabled');
const databaseUrl = validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL });
if (process.env.NODE_ENV !== 'test' || process.env.DATABASE_URL !== databaseUrl) {
  throw new Error('Use npm run test:integration with an isolated database');
}

describe('F-031 order reorder PostgreSQL integration (providers MOCK)', () => {
  let prisma: PrismaService;
  let cart: CartService;
  let service: ReorderService;
  let customerId: string;
  let orderId: string;
  let idempotencyKey: string;
  const sku = 'REORDER-INTEGRATION-SKU';

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cart = new CartService(prisma);
  });

  beforeEach(async () => {
    customerId = randomUUID();
    orderId = `REORDER-IT-${randomUUID()}`;
    idempotencyKey = randomUUID();
    const activeCart = await prisma.cart.create({
      data: { customerId, state: CartState.ACTIVE, version: 1 },
    });
    const orders = { getMyOrder: jest.fn().mockResolvedValue({ data: {
      orderId,
      state: 'PAGADO',
      lines: [
        { sku, quantity: 1, description: 'histórico', unitPrice: { amount: 10, currency: 'PEN' } },
        { sku, quantity: 2, description: 'histórico', unitPrice: { amount: 10, currency: 'PEN' } },
      ],
    } }) };
    const commerce = { checkSku: jest.fn().mockResolvedValue({
      status: 'AVAILABLE', maxAdditionalQuantity: 10,
      quote: { amount: 42.5, currency: 'PEN', version: 7 },
    }) };
    const config = { get: jest.fn((key: string) => ({
      REORDER_ENABLED: true, REORDER_SOURCE: 'mock', NODE_ENV: 'test', ORDERS_SOURCE: 'mock',
    } as Record<string, unknown>)[key]) };
    service = new ReorderService(prisma, orders as unknown as OrdersService, cart, config as never,
      commerce as unknown as ReorderCommerceProvider);
    expect(activeCart.version).toBe(1);
  });

  afterEach(async () => {
    await prisma.cartReorderOperation.deleteMany({ where: { customerId } });
    await prisma.cartItem.deleteMany({ where: { cart: { customerId } } });
    await prisma.cart.deleteMany({ where: { customerId } });
  });

  afterAll(async () => prisma.$disconnect());

  it('serializes concurrent repeats into one cart mutation and returns the same durable receipt', async () => {
    const [first, retry] = await Promise.all([
      service.reorder(customerId, orderId, idempotencyKey),
      service.reorder(customerId, orderId, idempotencyKey),
    ]);
    expect(retry).toEqual(first);
    expect(first.data.added).toEqual([{ sku, quantity: 3 }]);
    expect(first.data.version).toBe(2);
    const line = await prisma.cartItem.findUnique({ where: { cartId_sku: { cartId: first.data.cartId, sku } } });
    expect(line?.quantity).toBe(3);
    expect(Number(line?.unitPriceSnapshot)).toBe(42.5);
    expect(line?.priceVersion).toBe('7');
    expect(await prisma.cartReorderOperation.count({ where: { externalOrderId: orderId } })).toBe(1);

    const secondIntent = await service.reorder(customerId, orderId, randomUUID());
    expect(secondIntent.data.added).toEqual([{ sku, quantity: 3 }]);
    const updatedLine = await prisma.cartItem.findUnique({ where: { cartId_sku: { cartId: first.data.cartId, sku } } });
    expect(updatedLine?.quantity).toBe(6);
    expect(await prisma.cartReorderOperation.count({ where: { externalOrderId: orderId } })).toBe(2);
  });
});
