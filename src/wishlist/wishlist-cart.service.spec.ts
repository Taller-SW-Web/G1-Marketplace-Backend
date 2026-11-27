import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WishlistCartService } from './wishlist-cart.service';

describe('WishlistCartService transaction boundary', () => {
  it('finishes slow catalog calls before opening the transaction and validates the quoted total under lock', async () => {
    let transactionStarted = false;
    const events: string[] = [];
    const tx = {
      $executeRaw: jest.fn(async () => 0),
      $queryRaw: jest.fn(async () => [{ id: 'favorite' }]),
    };
    const prisma = {
      wishlistItem: { findUnique: jest.fn(async () => ({ id: 'favorite' })) },
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
        transactionStarted = true; events.push('transaction'); return work(tx);
      }),
    };
    const cart = {
      getActiveItemQuantity: jest.fn(async () => 2),
      lockOwner: jest.fn(async () => undefined),
      addItemInTransaction: jest.fn(async (_tx, _params, quote, expectedTotal) => {
        expect(expectedTotal).toBe(3);
        expect(await quote('SKU-1', 3)).toEqual({ amount: 10, currency: 'PEN', version: 7 });
        return { data: { cartId: 'cart', version: 2, items: [] } };
      }),
    };
    const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 30));
    const catalog = {
      resolveSku: jest.fn(async () => {
        expect(transactionStarted).toBe(false); events.push('resolve-start'); await delay();
        expect(transactionStarted).toBe(false); events.push('resolve-end'); return 'SKU-1';
      }),
      quote: jest.fn(async () => {
        expect(transactionStarted).toBe(false); events.push('quote-start'); await delay();
        expect(transactionStarted).toBe(false); events.push('quote-end');
        return { amount: 10, currency: 'PEN' as const, version: 7 };
      }),
    };

    const service = new WishlistCartService(prisma as never, cart as never, catalog as never);
    await expect(service.add('customer', 'product')).resolves.toMatchObject({ productId: 'product' });
    expect(events).toEqual(['resolve-start', 'resolve-end', 'quote-start', 'quote-end', 'transaction']);
  });

  it('requotes once outside PostgreSQL when a concurrent request changes the total', async () => {
    const tx = { $executeRaw: jest.fn(async () => 0), $queryRaw: jest.fn(async () => [{ id: 'favorite' }]) };
    const prisma = {
      wishlistItem: { findUnique: jest.fn(async () => ({ id: 'favorite' })) },
      $transaction: jest.fn()
        .mockRejectedValueOnce(new ConflictException({ code: 'CART_CHANGED_RETRY' }))
        .mockImplementationOnce(async (work) => work(tx)),
    };
    const cart = {
      getActiveItemQuantity: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
      lockOwner: jest.fn(async () => undefined),
      addItemInTransaction: jest.fn(async () => ({ data: { cartId: 'cart', version: 3, items: [] } })),
    };
    const catalog = {
      resolveSku: jest.fn(async () => 'SKU-1'),
      quote: jest.fn(async (_sku, total) => ({ amount: total * 10, currency: 'PEN', version: total })),
    };

    const service = new WishlistCartService(prisma as never, cart as never, catalog as never);
    await expect(service.add('customer', 'product')).resolves.toMatchObject({ productId: 'product' });
    expect(catalog.quote).toHaveBeenNthCalledWith(1, 'SKU-1', 1);
    expect(catalog.quote).toHaveBeenNthCalledWith(2, 'SKU-1', 2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('throws 409 CART_CONFLICT when favorite does not exist before or inside transaction', async () => {
    const prismaMissing = {
      wishlistItem: { findUnique: jest.fn(async () => null) },
      $transaction: jest.fn(),
    };
    const svcMissing = new WishlistCartService(prismaMissing as never, {} as never, {} as never);
    await expect(svcMissing.add('customer', 'product'))
      .rejects.toMatchObject({ status: 409, response: { code: 'CART_CONFLICT' } });

    const txEmpty = { $executeRaw: jest.fn(async () => 0), $queryRaw: jest.fn(async () => []) };
    const prismaEmptyTx = {
      wishlistItem: { findUnique: jest.fn(async () => ({ id: 'favorite' })) },
      $transaction: jest.fn(async (work) => work(txEmpty)),
    };
    const cart = { getActiveItemQuantity: jest.fn(async () => 0), lockOwner: jest.fn(async () => undefined) };
    const catalog = { resolveSku: jest.fn(async () => 'SKU-1'), quote: jest.fn(async () => ({ amount: 10, currency: 'PEN', version: 1 })) };
    const svcEmptyTx = new WishlistCartService(prismaEmptyTx as never, cart as never, catalog as never);
    await expect(svcEmptyTx.add('customer', 'product'))
      .rejects.toMatchObject({ status: 409, response: { code: 'CART_CONFLICT' } });
  });

  it('maps STOCK_LIMIT_REACHED, COMMERCE_DATA_UNAVAILABLE, exhausted retries, and Prisma lock errors', async () => {
    const baseDeps = () => ({
      prisma: {
        wishlistItem: { findUnique: jest.fn(async () => ({ id: 'favorite' })) },
        $transaction: jest.fn(),
      },
      cart: { getActiveItemQuantity: jest.fn(async () => 0) },
      catalog: { resolveSku: jest.fn(async () => 'SKU-1'), quote: jest.fn(async () => ({ amount: 10, currency: 'PEN', version: 1 })) },
    });

    const d1 = baseDeps();
    d1.prisma.$transaction.mockRejectedValue(new ConflictException({ code: 'CART_CHANGED_RETRY' }));
    await expect(new WishlistCartService(d1.prisma as never, d1.cart as never, d1.catalog as never).add('c', 'p'))
      .rejects.toMatchObject({ status: 409, response: { code: 'CART_CHANGED_RETRY' } });

    const d2 = baseDeps();
    d2.prisma.$transaction.mockRejectedValue(new ConflictException({ code: 'STOCK_LIMIT_REACHED' }));
    await expect(new WishlistCartService(d2.prisma as never, d2.cart as never, d2.catalog as never).add('c', 'p'))
      .rejects.toMatchObject({ status: 409, response: { code: 'STOCK_LIMIT_REACHED' } });

    const d3 = baseDeps();
    d3.prisma.$transaction.mockRejectedValue(new ServiceUnavailableException({ code: 'COMMERCE_DATA_UNAVAILABLE' }));
    await expect(new WishlistCartService(d3.prisma as never, d3.cart as never, d3.catalog as never).add('c', 'p'))
      .rejects.toMatchObject({ status: 503, response: { code: 'COMMERCE_DATA_UNAVAILABLE' } });

    const d4 = baseDeps();
    d4.prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('lock', { code: 'P2034', clientVersion: '5.22.0' }),
    );
    await expect(new WishlistCartService(d4.prisma as never, d4.cart as never, d4.catalog as never).add('c', 'p'))
      .rejects.toMatchObject({ status: 409, response: { code: 'CART_CONFLICT' } });
  });
});
