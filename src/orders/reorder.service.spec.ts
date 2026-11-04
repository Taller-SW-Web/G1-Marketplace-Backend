import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { CartService } from '../cart/cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { ReorderService } from './reorder.service';
import { ReorderCommerceProvider } from './reorder.types';

describe('ReorderService', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const orderId = 'PED-MOCK-001';
  const idempotencyKey = '33333333-3333-4333-8333-333333333333';
  let prisma: any;
  let tx: any;
  let orders: { getMyOrder: jest.Mock };
  let cart: any;
  let commerce: { checkSku: jest.Mock };
  let service: ReorderService;
  let currentCart: any;

  const receipt = (result: unknown, owner = customerId) => ({ customerId: owner, result });

  beforeEach(() => {
    currentCart = {
      id: 'cart-1', customerId, state: 'ACTIVE', currency: 'PEN', version: 3,
      items: [{ sku: 'MOCK-AERO-42', quantity: 1, unitPriceSnapshot: 100, priceVersion: '1' }],
    };
    tx = {
      cartReorderOperation: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      cart: { findUnique: jest.fn().mockImplementation(async () => ({ ...currentCart })) },
    };
    prisma = {
      cartReorderOperation: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) => callback(tx)),
    };
    orders = {
      getMyOrder: jest.fn().mockResolvedValue({ data: {
        orderId,
        state: 'PAGADO',
        lines: [
          { sku: 'MOCK-AERO-42', quantity: 1, description: 'old', unitPrice: { amount: 50, currency: 'PEN' } },
          { sku: 'MOCK-AERO-42', quantity: 2, description: 'old', unitPrice: { amount: 50, currency: 'PEN' } },
          { sku: 'RETIRED-SKU', quantity: 1, description: 'old', unitPrice: { amount: 10, currency: 'PEN' } },
        ],
      } }),
    };
    cart = {
      getCurrentCart: jest.fn().mockResolvedValue({
        cartId: 'cart-1', version: 3, items: [{ sku: 'MOCK-AERO-42', quantity: 1 }],
      }),
      lockOwner: jest.fn(),
      getOrCreateCart: jest.fn().mockImplementation(async () => currentCart),
      addItemInTransaction: jest.fn().mockImplementation(async (_tx, params) => {
        currentCart.version += 1;
        const existing = currentCart.items.find((item: any) => item.sku === params.sku);
        if (existing) existing.quantity += params.quantity;
        else currentCart.items.push({ sku: params.sku, quantity: params.quantity });
      }),
    };
    commerce = {
      checkSku: jest.fn(async ({ sku }) => sku === 'MOCK-AERO-42'
        ? { status: 'AVAILABLE', maxAdditionalQuantity: 5, quote: { amount: 249.9, currency: 'PEN', version: 3 } }
        : { status: 'NOT_AVAILABLE' }),
    };
    const config = { get: jest.fn((key: string) => ({
      REORDER_ENABLED: true,
      REORDER_SOURCE: 'mock',
      NODE_ENV: 'test',
      ORDERS_SOURCE: 'mock',
    } as Record<string, unknown>)[key]) };
    service = new ReorderService(
      prisma as PrismaService,
      orders as unknown as OrdersService,
      cart as unknown as CartService,
      config as never,
      commerce as unknown as ReorderCommerceProvider,
    );
  });

  it('authorizes source order, aggregates duplicate SKUs, uses current quote and commits a partial result with a durable receipt', async () => {
    tx.cartReorderOperation.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    const result = await service.reorder(customerId, orderId, idempotencyKey, 'user-token');
    expect(orders.getMyOrder).toHaveBeenCalledWith(orderId, 'user-token');
    expect(commerce.checkSku).toHaveBeenCalledTimes(2);
    expect(commerce.checkSku).toHaveBeenCalledWith({ sku: 'MOCK-AERO-42', requestedQuantity: 3, currentQuantity: 1 });
    expect(cart.addItemInTransaction).toHaveBeenCalledWith(tx,
      { customerId, sku: 'MOCK-AERO-42', quantity: 3 }, undefined,
      { amount: 249.9, currency: 'PEN', version: 3 });
    expect(result).toEqual({ data: {
      cartId: 'cart-1', version: 4, added: [{ sku: 'MOCK-AERO-42', quantity: 3 }],
      adjustments: [{ sku: 'RETIRED-SKU', reason: 'NOT_AVAILABLE' }],
    } });
    expect(tx.cartReorderOperation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ externalOrderId: orderId, customerId, idempotencyKey, result: result.data }),
    }));
    expect(prisma.cartReorderOperation.findUnique).toHaveBeenCalledWith({
      where: { customerId_externalOrderId_idempotencyKey: { customerId, externalOrderId: orderId, idempotencyKey } },
    });
  });

  it('replays the stored result without rechecking providers or adding cart lines', async () => {
    const stored = { cartId: 'cart-old', version: 9, added: [{ sku: 'MOCK-AERO-42', quantity: 3 }], adjustments: [] };
    prisma.cartReorderOperation.findUnique.mockResolvedValue(receipt(stored));
    await expect(service.reorder(customerId, orderId, idempotencyKey)).resolves.toEqual({ data: stored });
    expect(commerce.checkSku).not.toHaveBeenCalled();
    expect(cart.addItemInTransaction).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not reveal or replay a receipt owned by another customer', async () => {
    prisma.cartReorderOperation.findUnique.mockResolvedValue(receipt({ cartId: 'cart-2' }, '22222222-2222-4222-8222-222222222222'));
    await expect(service.reorder(customerId, orderId, idempotencyKey)).rejects.toBeInstanceOf(NotFoundException);
    expect(cart.addItemInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a changed cart before writing any item or receipt', async () => {
    cart.getOrCreateCart.mockResolvedValue({ ...currentCart, version: 4 });
    await expect(service.reorder(customerId, orderId, idempotencyKey)).rejects.toBeInstanceOf(ConflictException);
    expect(cart.addItemInTransaction).not.toHaveBeenCalled();
    expect(tx.cartReorderOperation.create).not.toHaveBeenCalled();
  });

  it('keeps the endpoint unavailable unless the local mock gate is explicitly enabled', async () => {
    const config = { get: jest.fn((key: string) => key === 'REORDER_ENABLED' ? false : 'unconfigured') };
    const disabled = new ReorderService(prisma, orders as unknown as OrdersService, cart, config as never, commerce as never);
    await expect(disabled.reorder(customerId, orderId, idempotencyKey)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(orders.getMyOrder).not.toHaveBeenCalled();
  });

  it('keeps mock reorder unavailable outside the test environment', async () => {
    const config = { get: jest.fn((key: string) => {
      if (key === 'REORDER_ENABLED') return true;
      if (key === 'NODE_ENV') return 'development';
      return 'mock';
    }) };
    const development = new ReorderService(prisma, orders as unknown as OrdersService, cart, config as never, commerce as never);
    await expect(development.reorder(customerId, orderId, idempotencyKey)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(orders.getMyOrder).not.toHaveBeenCalled();
  });
});
