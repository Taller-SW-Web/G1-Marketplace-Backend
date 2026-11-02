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

