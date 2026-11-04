import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { CartState, Prisma } from '@prisma/client';

describe('CartService - F-031 confirmed current commercial quote', () => {
  it('writes the prevalidated current price snapshot without reusing historical pricing', async () => {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{}]),
      cart: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cart-1', customerId: '11111111-1111-4111-8111-111111111111',
          state: CartState.ACTIVE, currency: 'PEN', version: 2, items: [] }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'cart-1', version: 3, currency: 'PEN', items: [] }),
      },
      cartItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new CartService({} as PrismaService);
    await service.addItemInTransaction(tx, {
      customerId: '11111111-1111-4111-8111-111111111111', sku: 'MOCK-AERO-42', quantity: 2,
    }, undefined, { amount: 249.9, currency: 'PEN', version: 3 });
    expect(tx.cartItem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sku: 'MOCK-AERO-42', quantity: 2,
        unitPriceSnapshot: expect.any(Prisma.Decimal), priceVersion: '3',
      }),
    }));
  });
});

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
    expect((result as unknown as Record<string, unknown>).customerId).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).anonymousSessionHash).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).email).toBeUndefined();
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

describe('CartService - F-020: mergeAnonymousCart', () => {
  let service: CartService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      cart: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cartItem: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    mockPrisma = {
      cart: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockTx)),
    };
    service = new CartService(mockPrisma as PrismaService);
  });

  it('SEC-F020-01: throws UNAUTHENTICATED if customerId is missing', async () => {
    await expect(
      service.mergeAnonymousCart({
        customerId: '',
        sessionHash: 'hash-1',
      }),
    ).rejects.toThrow();
  });

  it('RN-F020-05: returns merged: false when sessionHash is missing or undefined', async () => {
    mockPrisma.cart.findFirst.mockResolvedValueOnce({
      id: 'user-cart-1',
      version: 2,
    });

    const result = await service.mergeAnonymousCart({
      customerId: 'cust-123',
      sessionHash: undefined,
    });

    expect(result).toEqual({
      cartId: 'user-cart-1',
      version: 2,
      merged: false,
      adjustments: [],
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('API-CA-F020-01: returns merged: false when anonymous cart does not exist or has no items', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(null); // anonymous cart not found
    mockTx.cart.findFirst.mockResolvedValueOnce({
      id: 'user-cart-1',
      version: 3,
    });

    const result = await service.mergeAnonymousCart({
      customerId: 'cust-123',
      sessionHash: 'hash-empty',
    });

    expect(result.merged).toBe(false);
    expect(result.cartId).toBe('user-cart-1');
  });

  it('RN-F020-03: creates customer cart if user has none and transfers anonymous items', async () => {
    const anonCart = {
      id: 'anon-cart-1',
      currency: 'PEN',
      state: CartState.ACTIVE,
      items: [
        {
          id: 'item-1',
          sku: 'INKA-PRO-M',
          quantity: 2,
          unitPriceSnapshot: new Prisma.Decimal(50.0),
          priceVersion: '1',
          productId: 'prod-1',
          variantId: 'var-1',
          quotedAt: new Date(),
        },
      ],
    };

    mockTx.cart.findFirst.mockResolvedValueOnce(anonCart); // anonymous cart
    mockTx.cart.findFirst.mockResolvedValueOnce(null); // user has no cart yet
    mockTx.cart.create.mockResolvedValueOnce({
      id: 'new-user-cart',
      customerId: 'cust-123',
      currency: 'PEN',
      version: 0,
      state: CartState.ACTIVE,
      items: [],
    });
    mockTx.cartItem.create.mockResolvedValueOnce({});
    mockTx.cart.update.mockResolvedValueOnce({
      id: 'new-user-cart',
      version: 1,
    });
    mockTx.cart.update.mockResolvedValueOnce({
      id: 'anon-cart-1',
      state: CartState.MERGED,
      mergedIntoCartId: 'new-user-cart',
    });

    const result = await service.mergeAnonymousCart({
      customerId: 'cust-123',
      sessionHash: 'hash-anon',
    });

    expect(result.merged).toBe(true);
    expect(result.cartId).toBe('new-user-cart');
    expect(result.version).toBe(1);
    expect(mockTx.cartItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cartId: 'new-user-cart',
          sku: 'INKA-PRO-M',
          quantity: 2,
        }),
      }),
    );
    // Verified: anonymous cart marked MERGED
    expect(mockTx.cart.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'anon-cart-1' },
        data: expect.objectContaining({
          state: CartState.MERGED,
          mergedIntoCartId: 'new-user-cart',
        }),
      }),
    );
  });

  it('RN-F020-01 / RN-F020-02: sums quantities for existing SKUs and marks anonymous cart as MERGED', async () => {
    const anonCart = {
      id: 'anon-cart-2',
      currency: 'PEN',
      state: CartState.ACTIVE,
      items: [
        {
          id: 'anon-item-1',
          sku: 'INKA-PRO-M',
          quantity: 3,
          unitPriceSnapshot: new Prisma.Decimal(50.0),
        },
      ],
    };

    const userCart = {
      id: 'user-cart-2',
      customerId: 'cust-123',
      currency: 'PEN',
      version: 5,
      state: CartState.ACTIVE,
      items: [
        {
          id: 'user-item-1',
          sku: 'INKA-PRO-M',
          quantity: 2,
          unitPriceSnapshot: new Prisma.Decimal(50.0),
        },
      ],
    };

    mockTx.cart.findFirst.mockResolvedValueOnce(anonCart);
    mockTx.cart.findFirst.mockResolvedValueOnce(userCart);
    mockTx.cartItem.update.mockResolvedValueOnce({});
    mockTx.cart.update.mockResolvedValueOnce({
      id: 'user-cart-2',
      version: 6,
    });
    mockTx.cart.update.mockResolvedValueOnce({
      id: 'anon-cart-2',
      state: CartState.MERGED,
    });

    const result = await service.mergeAnonymousCart({
      customerId: 'cust-123',
      sessionHash: 'hash-anon-2',
    });

    expect(result.merged).toBe(true);
    expect(result.version).toBe(6);
    expect(result.adjustments).toHaveLength(0);
    // Quantity 2 + 3 = 5
    expect(mockTx.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-item-1' },
        data: expect.objectContaining({ quantity: 5 }),
      }),
    );
  });

  it('RN-F020-02 / CA-F020-03: caps combined quantity at 99 and emits STOCK_LIMIT adjustment', async () => {
    const anonCart = {
      id: 'anon-cart-3',
      currency: 'PEN',
      state: CartState.ACTIVE,
      items: [
        {
          id: 'anon-item-2',
          sku: 'INKA-CAP-SKU',
          quantity: 20,
          unitPriceSnapshot: new Prisma.Decimal(30.0),
        },
      ],
    };

    const userCart = {
      id: 'user-cart-3',
      customerId: 'cust-123',
      currency: 'PEN',
      version: 1,
      state: CartState.ACTIVE,
      items: [
        {
          id: 'user-item-2',
          sku: 'INKA-CAP-SKU',
          quantity: 90,
          unitPriceSnapshot: new Prisma.Decimal(30.0),
        },
      ],
    };

    mockTx.cart.findFirst.mockResolvedValueOnce(anonCart);
    mockTx.cart.findFirst.mockResolvedValueOnce(userCart);
    mockTx.cartItem.update.mockResolvedValueOnce({});
    mockTx.cart.update.mockResolvedValueOnce({
      id: 'user-cart-3',
      version: 2,
    });
    mockTx.cart.update.mockResolvedValueOnce({ id: 'anon-cart-3' });

    const result = await service.mergeAnonymousCart({
      customerId: 'cust-123',
      sessionHash: 'hash-anon-3',
    });

    expect(result.merged).toBe(true);
    expect(result.adjustments).toEqual([
      {
        sku: 'INKA-CAP-SKU',
        requestedQuantity: 110,
        confirmedQuantity: 99,
        reason: 'STOCK_LIMIT',
      },
    ]);
    expect(mockTx.cartItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-item-2' },
        data: expect.objectContaining({ quantity: 99 }),
      }),
    );
  });

  it('RN-F020-04 / API-CA-F020-02: transaction failure preserves both carts intact without partial merge', async () => {
    mockTx.cart.findFirst.mockRejectedValueOnce(new Error('DB transaction error'));

    await expect(
      service.mergeAnonymousCart({
        customerId: 'cust-123',
        sessionHash: 'hash-fail',
      }),
    ).rejects.toThrow('DB transaction error');

    expect(mockTx.cart.update).not.toHaveBeenCalled();
    expect(mockTx.cartItem.update).not.toHaveBeenCalled();
  });
});

describe('CartService - F-021: moveItemToWishlist', () => {
  let service: CartService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      cart: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      cartItem: {
        delete: jest.fn(),
      },
      wishlistItem: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    mockPrisma = {
      $transaction: jest.fn((cb) => cb(mockTx)),
    };
    service = new CartService(mockPrisma as PrismaService);
  });

  it('SEC-F021-01: throws UNAUTHENTICATED if customerId is missing', async () => {
    await expect(
      service.moveItemToWishlist({
        customerId: '',
        sku: 'SKU-001',
      }),
    ).rejects.toThrow();
  });

  it('RN-F021-01: rejects empty or invalid sku with 400 INVALID_SKU', async () => {
    await expect(
      service.moveItemToWishlist({
        customerId: 'cust-123',
        sku: '   ',
      }),
    ).rejects.toThrow('El SKU no puede estar vacío.');

    await expect(
      service.moveItemToWishlist({
        customerId: 'cust-123',
        sku: 'invalid/sku!@#',
      }),
    ).rejects.toThrow('Formato de SKU inválido.');
  });

  it('RN-F021-02: rejects version mismatch with 409 CART_CONFLICT', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce({
      id: 'cart-1',
      version: 5,
      items: [{ id: 'item-1', sku: 'SKU-100', productId: 'PRD-100' }],
    });

    await expect(
      service.moveItemToWishlist({
        customerId: 'cust-123',
        sku: 'SKU-100',
        expectedVersion: 4,
      }),
    ).rejects.toThrow('Conflicto de versión en carrito');
  });

  it('RN-F021-03: rejects with 404 CART_ITEM_NOT_FOUND if cart or item does not exist', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.moveItemToWishlist({
        customerId: 'cust-123',
        sku: 'SKU-404',
      }),
    ).rejects.toMatchObject({ response: { code: 'CART_ITEM_NOT_FOUND' } });

    mockTx.cart.findFirst.mockResolvedValueOnce({
      id: 'cart-1',
      version: 1,
      items: [{ id: 'item-1', sku: 'SKU-OTHER' }],
    });

    await expect(
      service.moveItemToWishlist({
        customerId: 'cust-123',
        sku: 'SKU-404',
      }),
    ).rejects.toMatchObject({ response: { code: 'CART_ITEM_NOT_FOUND' } });
  });

  it('RN-F021-03: creates WishlistItem, deletes CartItem, and increments cart version', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce({
      id: 'cart-123',
      version: 2,
      items: [{ id: 'item-1', sku: 'SKU-101', productId: 'PRD-101' }],
    });
    mockTx.wishlistItem.findUnique.mockResolvedValueOnce(null); // not yet in wishlist
    mockTx.wishlistItem.create.mockResolvedValueOnce({ id: 'wish-1' });
    mockTx.cartItem.delete.mockResolvedValueOnce({});
    mockTx.cart.update.mockResolvedValueOnce({
      id: 'cart-123',
      version: 3,
    });

    const result = await service.moveItemToWishlist({
      customerId: 'cust-123',
      sku: 'SKU-101',
      expectedVersion: 2,
    });

    expect(result).toEqual({
      cartId: 'cart-123',
      version: 3,
      productId: 'PRD-101',
      wishlistCreated: true,
    });
    expect(mockTx.wishlistItem.create).toHaveBeenCalledWith({
      data: {
        customerId: 'cust-123',
        productId: 'PRD-101',
      },
    });
    expect(mockTx.cartItem.delete).toHaveBeenCalledWith({
      where: { id: 'item-1' },
    });
    expect(mockTx.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-123' },
      data: expect.objectContaining({
        version: { increment: 1 },
      }),
    });
  });

  it('RN-F021-04 / API-CA-F021-01: deletes CartItem and returns wishlistCreated: false when already in wishlist', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce({
      id: 'cart-123',
      version: 4,
      items: [{ id: 'item-2', sku: 'SKU-EXIST', productId: 'PRD-EXIST' }],
    });
    mockTx.wishlistItem.findUnique.mockResolvedValueOnce({ id: 'already-fav' });
    mockTx.cartItem.delete.mockResolvedValueOnce({});
    mockTx.cart.update.mockResolvedValueOnce({
      id: 'cart-123',
      version: 5,
    });

    const result = await service.moveItemToWishlist({
      customerId: 'cust-123',
      sku: 'SKU-EXIST',
    });

    expect(result).toEqual({
      cartId: 'cart-123',
      version: 5,
      productId: 'PRD-EXIST',
      wishlistCreated: false,
    });
    expect(mockTx.wishlistItem.create).not.toHaveBeenCalled();
    expect(mockTx.cartItem.delete).toHaveBeenCalledWith({
      where: { id: 'item-2' },
    });
  });

  it('CA-F021-01: transaction failure when saving favorite preserves CartItem intact', async () => {
    mockTx.cart.findFirst.mockResolvedValueOnce({
      id: 'cart-123',
      version: 1,
      items: [{ id: 'item-fail', sku: 'SKU-FAIL', productId: 'PRD-FAIL' }],
    });
    mockTx.wishlistItem.findUnique.mockRejectedValueOnce(new Error('Wishlist DB error'));

    await expect(
      service.moveItemToWishlist({
        customerId: 'cust-123',
        sku: 'SKU-FAIL',
      }),
    ).rejects.toThrow('Wishlist DB error');

    expect(mockTx.cartItem.delete).not.toHaveBeenCalled();
    expect(mockTx.cart.update).not.toHaveBeenCalled();
  });
});
