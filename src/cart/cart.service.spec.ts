import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { CartState, Prisma } from '@prisma/client';

describe('CartService - F-017: updateItemQuantityInTransaction', () => {
  let service: CartService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn((cb) => cb(mockTx)),
    };
    service = new CartService(mockPrisma as PrismaService);
  });

  const mockTx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{}]),
    cart: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cartItem: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const sampleCart = {
    id: 'cart-uuid-1',
    customerId: 'cust-1',
    anonymousSessionHash: null,
    state: CartState.ACTIVE,
    currency: 'PEN',
    version: 2,
    items: [],
  };

  const sampleItem = {
    id: 'item-uuid-1',
    cartId: 'cart-uuid-1',
    sku: 'INKA-PRO-M',
    quantity: 2,
    unitPriceSnapshot: new Prisma.Decimal(50.0),
    priceVersion: '1',
  };

  it('rejects invalid sku with 400 INVALID_SKU', async () => {
    await expect(
      service.updateItemQuantityInTransaction(mockTx, {
        customerId: 'cust-1',
        sku: '   ',
        quantity: 3,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects quantity 0 with 400 INVALID_QUANTITY (API-CA-F017-01: no implicit delete)', async () => {
    await expect(
      service.updateItemQuantityInTransaction(mockTx, {
        customerId: 'cust-1',
        sku: 'INKA-PRO-M',
        quantity: 0,
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_QUANTITY' },
    });
  });

  it('rejects quantity > 99 with 400 INVALID_QUANTITY', async () => {
    await expect(
      service.updateItemQuantityInTransaction(mockTx, {
        customerId: 'cust-1',
        sku: 'INKA-PRO-M',
        quantity: 100,
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_QUANTITY' },
    });
  });

  it('rejects version mismatch with 409 CART_CONFLICT', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(sampleCart);

    await expect(
      service.updateItemQuantityInTransaction(mockTx, {
        customerId: 'cust-1',
        sku: 'INKA-PRO-M',
        quantity: 3,
        expectedVersion: 1, // sampleCart.version is 2
      }),
    ).rejects.toMatchObject({
      response: { code: 'CART_CONFLICT' },
    });
  });

  it('rejects when item does not exist in cart with 404 CART_ITEM_NOT_FOUND', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(sampleCart);
    mockTx.cartItem.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.updateItemQuantityInTransaction(mockTx, {
        customerId: 'cust-1',
        sku: 'INKA-NOT-FOUND',
        quantity: 3,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({
      response: { code: 'CART_ITEM_NOT_FOUND' },
    });
  });

  it('updates quantity and increments cart version (RN-F017-01, CA-F017-01)', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(sampleCart);
    mockTx.cartItem.findUnique.mockResolvedValueOnce(sampleItem);
    mockTx.cartItem.update.mockResolvedValueOnce({
      ...sampleItem,
      quantity: 5,
    });
    mockTx.cart.update.mockResolvedValueOnce({
      ...sampleCart,
      version: 3,
      items: [{ ...sampleItem, quantity: 5 }],
    });

    const result = await service.updateItemQuantityInTransaction(mockTx, {
      customerId: 'cust-1',
      sku: 'INKA-PRO-M',
      quantity: 5,
      expectedVersion: 2,
    });

    expect(mockTx.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleItem.id },
        data: expect.objectContaining({ quantity: 5 }),
      }),
    );
    expect(mockTx.cart.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: sampleCart.id },
        data: { version: { increment: 1 } },
      }),
    );
    expect(result.version).toBe(3);
    expect(result.items[0].quantity).toBe(5);
  });

  it('refreshes unit price snapshot when quote is provided (RN-F017-04)', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(sampleCart);
    mockTx.cartItem.findUnique.mockResolvedValueOnce(sampleItem);
    mockTx.cartItem.update.mockResolvedValueOnce({
      ...sampleItem,
      quantity: 4,
      unitPriceSnapshot: new Prisma.Decimal(55.0),
      priceVersion: '2',
    });
    mockTx.cart.update.mockResolvedValueOnce({
      ...sampleCart,
      version: 3,
      items: [
        {
          ...sampleItem,
          quantity: 4,
          unitPriceSnapshot: new Prisma.Decimal(55.0),
          priceVersion: '2',
        },
      ],
    });

    const mockQuote = jest.fn().mockResolvedValue({
      amount: 55.0,
      currency: 'PEN',
      version: 2,
    });

    const result = await service.updateItemQuantityInTransaction(
      mockTx,
      {
        customerId: 'cust-1',
        sku: 'INKA-PRO-M',
        quantity: 4,
        expectedVersion: 2,
      },
      mockQuote,
    );

    expect(mockQuote).toHaveBeenCalledWith('INKA-PRO-M', 4);
    expect(mockTx.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 4,
          unitPriceSnapshot: new Prisma.Decimal(55.0),
          priceVersion: '2',
        }),
      }),
    );
    expect(result.items[0].unitPrice?.amount).toBe(55.0);
    expect(result.items[0].unitPrice?.version).toBe(2);
  });

  it('rejects with 409 COMMERCE_DATA_UNAVAILABLE if quote is invalid', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(sampleCart);
    mockTx.cartItem.findUnique.mockResolvedValueOnce(sampleItem);

    const invalidQuote = jest.fn().mockResolvedValue({
      amount: -10,
      currency: 'PEN',
      version: 1,
    });

    await expect(
      service.updateItemQuantityInTransaction(
        mockTx,
        {
          customerId: 'cust-1',
          sku: 'INKA-PRO-M',
          quantity: 4,
          expectedVersion: 2,
        },
        invalidQuote,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_DATA_UNAVAILABLE' },
    });
  });
});

describe('CartService - F-018: removeItemFromCart', () => {
  let service: CartService;
  let mockPrisma: any;

  const mockTx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{}]),
    cart: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    cartItem: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  const sampleCart = {
    id: 'cart-uuid-1',
    customerId: 'cust-1',
    anonymousSessionHash: null,
    state: CartState.ACTIVE,
    currency: 'PEN',
    version: 3,
    items: [],
  };

  const sampleItem = {
    id: 'item-uuid-1',
    cartId: 'cart-uuid-1',
    sku: 'INKA-PRO-M',
    quantity: 2,
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn((cb) => cb(mockTx)),
    };
    service = new CartService(mockPrisma as PrismaService);
    jest.clearAllMocks();
  });

  it('rejects empty or blank sku with 400 INVALID_SKU', async () => {
    await expect(
      service.removeItemFromCartInTransaction(mockTx, {
        customerId: 'cust-1',
        sku: '   ',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects malformed sku with 400 INVALID_SKU', async () => {
    await expect(
      service.removeItemFromCartInTransaction(mockTx, {
        customerId: 'cust-1',
        sku: 'SKU!@#$',
      }),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_SKU' },
    });
  });

  it('rejects version mismatch with 409 CART_CONFLICT', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(sampleCart);

    await expect(
      service.removeItemFromCartInTransaction(mockTx, {
        customerId: 'cust-1',
        sku: 'INKA-PRO-M',
        expectedVersion: 1, // sampleCart is version 3
      }),
    ).rejects.toMatchObject({
      response: { code: 'CART_CONFLICT' },
    });
  });

  it('is idempotent (RN-F018-03): returns mutated: false and current version if item does not exist', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(sampleCart);
    mockTx.cartItem.findUnique.mockResolvedValueOnce(null);

    const result = await service.removeItemFromCartInTransaction(mockTx, {
      customerId: 'cust-1',
      sku: 'INKA-PRO-M',
      expectedVersion: 3,
    });

    expect(result).toEqual({ mutated: false, version: 3 });
    expect(mockTx.cartItem.delete).not.toHaveBeenCalled();
    expect(mockTx.cart.update).not.toHaveBeenCalled();
  });

  it('deletes existing CartItem and increments Cart.version (RN-F018-01 / CA-F018-01)', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(sampleCart);
    mockTx.cartItem.findUnique.mockResolvedValueOnce(sampleItem);
    mockTx.cartItem.delete.mockResolvedValueOnce(sampleItem);
    mockTx.cart.update.mockResolvedValueOnce({ ...sampleCart, version: 4 });

    const result = await service.removeItemFromCartInTransaction(mockTx, {
      customerId: 'cust-1',
      sku: 'INKA-PRO-M',
      expectedVersion: 3,
    });

    expect(mockTx.cartItem.delete).toHaveBeenCalledWith({
      where: { id: 'item-uuid-1' },
    });
    expect(mockTx.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-uuid-1' },
      data: { version: { increment: 1 } },
    });
    expect(result).toEqual({ mutated: true, version: 4 });
  });
});

describe('CartService - F-019: getCurrentCart', () => {
  let service: CartService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      cart: {
        findFirst: jest.fn(),
      },
    };
    service = new CartService(mockPrisma as PrismaService);
  });

  it('API-CA-F019-01: returns empty cart snapshot when no active cart exists', async () => {
    mockPrisma.cart.findFirst.mockResolvedValueOnce(null);

    const result = await service.getCurrentCart({
      sessionHash: 'anon-hash-1',
    });

    expect(result).toEqual({
      cartId: null,
      version: 0,
      items: [],
      subtotal: null,
    });
    expect(mockPrisma.cart.findFirst).toHaveBeenCalledWith({
      where: { anonymousSessionHash: 'anon-hash-1', state: CartState.ACTIVE },
      include: { items: true },
    });
  });

  it('RN-F019-02: returns cart snapshot and calculates subtotal correctly', async () => {
    const mockCart = {
      id: 'cart-1',
      version: 5,
      currency: 'PEN',
      state: CartState.ACTIVE,
      customerId: 'cust-123',
      items: [
        {
          id: 'item-1',
          cartId: 'cart-1',
          sku: 'AERO-42-BLK',
          quantity: 2,
          unitPriceSnapshot: new Prisma.Decimal(170.0),
          priceVersion: '8',
        },
      ],
    };

    mockPrisma.cart.findFirst.mockResolvedValueOnce(mockCart);

    const result = await service.getCurrentCart({
      customerId: 'cust-123',
    });

    expect(result.cartId).toBe('cart-1');
    expect(result.version).toBe(5);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      sku: 'AERO-42-BLK',
      quantity: 2,
      unitPrice: { amount: 170.0, currency: 'PEN', version: 8 },
      availability: 'AVAILABLE',
      attention: null,
    });
    expect(result.subtotal).toEqual({ amount: 340.0, currency: 'PEN' });
  });

  it('RN-F019-03: returns subtotal null and attention PRECIO_PENDIENTE if an item has no price', async () => {
    const mockCart = {
      id: 'cart-2',
      version: 2,
      currency: 'PEN',
      state: CartState.ACTIVE,
      customerId: 'cust-456',
      items: [
        {
          id: 'item-2',
          cartId: 'cart-2',
          sku: 'PEND-SKU',
          quantity: 1,
          unitPriceSnapshot: null,
          priceVersion: null,
        },
      ],
    };

    mockPrisma.cart.findFirst.mockResolvedValueOnce(mockCart);

    const result = await service.getCurrentCart({
      customerId: 'cust-456',
    });

    expect(result.subtotal).toBeNull();
    expect(result.items[0].unitPrice).toBeUndefined();
    expect(result.items[0].attention).toBe('PRECIO_PENDIENTE');
  });

  it('API-CA-F019-02: non-mutating read does not modify database state or quantities', async () => {
    const mockCart = {
      id: 'cart-3',
      version: 1,
      currency: 'PEN',
      state: CartState.ACTIVE,
      customerId: 'cust-789',
      items: [],
    };

    mockPrisma.cart.findFirst.mockResolvedValueOnce(mockCart);

    const result = await service.getCurrentCart({ customerId: 'cust-789' });

    expect(result.cartId).toBe('cart-3');
    expect(result.items).toHaveLength(0);
    expect(result.subtotal).toBeNull();
    expect(mockPrisma.cart.update).toBeUndefined();
  });

  it('SEC-F019-01: session isolation guarantees no PII leakage and filters strictly by identity', async () => {
    const mockCart = {
      id: 'cart-sec-1',
      version: 1,
      currency: 'PEN',
      state: CartState.ACTIVE,
      customerId: 'cust-sec-999',
      anonymousSessionHash: 'hash-sec-secret',
      items: [
        {
          id: 'item-1',
          cartId: 'cart-sec-1',
          sku: 'AERO-42-BLK',
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal(120.0),
          priceVersion: '1',
        },
      ],
    };

    mockPrisma.cart.findFirst.mockResolvedValueOnce(mockCart);

    const result = await service.getCurrentCart({ customerId: 'cust-sec-999' });

    expect(mockPrisma.cart.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: 'cust-sec-999', state: CartState.ACTIVE },
      }),
    );

    // Verify snapshot does NOT contain customerId, anonymousSessionHash, email or internal sensitive keys
    expect((result as Record<string, unknown>).customerId).toBeUndefined();
    expect((result as Record<string, unknown>).anonymousSessionHash).toBeUndefined();
    expect((result as Record<string, unknown>).email).toBeUndefined();
    expect(result.items[0]).not.toHaveProperty('cartId');
  });

  it('SEC-F019-02: Negative - Cross-session isolation: anonymous user B cannot access anonymous user A cart', async () => {
    // Database returns null when querying with anonymousSessionHash of User B
    mockPrisma.cart.findFirst.mockResolvedValueOnce(null);

    const result = await service.getCurrentCart({ sessionHash: 'user-b-session-hash' });

    expect(mockPrisma.cart.findFirst).toHaveBeenCalledWith({
      where: { anonymousSessionHash: 'user-b-session-hash', state: CartState.ACTIVE },
      include: { items: true },
    });
    expect(result).toEqual({
      cartId: null,
      version: 0,
      items: [],
      subtotal: null,
    });
  });

  it('SEC-F019-03: Negative - State isolation: inactive (CHECKED_OUT / ABANDONED) carts are never exposed', async () => {
    // If only non-active carts exist in DB, findFirst with state: ACTIVE returns null
    mockPrisma.cart.findFirst.mockResolvedValueOnce(null);

    const result = await service.getCurrentCart({ customerId: 'cust-inactive-owner' });

    expect(mockPrisma.cart.findFirst).toHaveBeenCalledWith({
      where: { customerId: 'cust-inactive-owner', state: CartState.ACTIVE },
      include: { items: true },
    });
    expect(result).toEqual({
      cartId: null,
      version: 0,
      items: [],
      subtotal: null,
    });
  });

  it('SEC-F019-04: Negative - Customer cross-account isolation: customer A cannot access customer B cart', async () => {
    mockPrisma.cart.findFirst.mockResolvedValueOnce(null);

    const result = await service.getCurrentCart({ customerId: 'attacker-customerId' });

    expect(mockPrisma.cart.findFirst).toHaveBeenCalledWith({
      where: { customerId: 'attacker-customerId', state: CartState.ACTIVE },
      include: { items: true },
    });
    expect(result.cartId).toBeNull();
    expect(result.items).toHaveLength(0);
  });
});
