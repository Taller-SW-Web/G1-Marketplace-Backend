import { ConflictException } from '@nestjs/common';
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
});
