import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cart, CartItem, CartState, Prisma } from '@prisma/client';
import { CommerceQuote } from '../catalog/wishlist-catalog';

export interface AddCartParams {
  sessionHash?: string;
  customerId?: string;
  sku: string;
  quantity?: number;
}

export interface CartItemDto {
  sku: string;
  quantity: number;
  unitPrice?: {
    amount: number;
    currency: string;
    version: number;
  };
}

export interface CartSnapshotDto {
  cartId: string | null;
  version: number;
  items: CartItemDto[];
}

export interface AddItemResult {
  status: 200 | 201;
  code: 'ITEM_CREATED' | 'ITEM_INCREMENTED';
  data: CartSnapshotDto;
}

type CartWithItems = Cart & { items: CartItem[] };

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtener o crear carrito activo para la sesión o cliente
   */
  async getOrCreateCart(
    tx: Prisma.TransactionClient,
    params: { sessionHash?: string; customerId?: string },
  ): Promise<CartWithItems> {
    const { sessionHash, customerId } = params;
    let cart: CartWithItems | null = null;

    if (customerId) {
      cart = await tx.cart.findFirst({
        where: { customerId, state: CartState.ACTIVE },
        include: { items: true },
      });

      if (!cart && sessionHash) {
        const anonCart = await tx.cart.findFirst({
          where: {
            anonymousSessionHash: sessionHash,
            customerId: null,
            state: CartState.ACTIVE,
          },
          include: { items: true },
        });
        if (anonCart) {
          cart = await tx.cart.update({
            where: { id: anonCart.id },
            data: { customerId, anonymousSessionHash: null },
            include: { items: true },
          });
        }
      }
    } else if (sessionHash) {
      cart = await tx.cart.findFirst({
        where: { anonymousSessionHash: sessionHash, state: CartState.ACTIVE },
        include: { items: true },
      });
    }

    if (!cart) {
      cart = await tx.cart.create({
        data: {
          customerId: customerId ?? null,
          anonymousSessionHash: sessionHash ?? null,
          state: CartState.ACTIVE,
          currency: 'PEN',
          version: 1,
        },
        include: { items: true },
      });
    }

    return cart;
  }

  /**
   * TASK-F016-BE-001: Agregar ítem al carrito en transacción segura
   */
  async addItemToCart(params: AddCartParams): Promise<AddItemResult> {
    return this.prisma.$transaction((tx) => this.addItemInTransaction(tx, params));
  }

  async lockOwner(tx: Prisma.TransactionClient, params: { customerId?: string; sessionHash?: string }): Promise<void> {
    const owner = params.customerId ? `customer:${params.customerId}` : `session:${params.sessionHash}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cart:${owner}`}, 0))::text`;
  }

  async addItemInTransaction(tx: Prisma.TransactionClient, params: AddCartParams,
    quote?: (sku: string, totalQuantity: number) => Promise<CommerceQuote>): Promise<AddItemResult> {
    const { sessionHash, customerId, sku } = params;
    const quantity = params.quantity ?? 1;

    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      throw new BadRequestException({
        code: 'INVALID_SKU',
        message: 'El parámetro sku es requerido.',
      });
    }

    const parsedQty = Number(quantity);
    if (!Number.isInteger(parsedQty) || parsedQty < 1 || parsedQty > 99) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'La cantidad debe ser un entero entre 1 y 99.',
      });
    }

    await this.lockOwner(tx, { sessionHash, customerId });
    const cart = await this.getOrCreateCart(tx, { sessionHash, customerId });

    const existingItem = await tx.cartItem.findUnique({
      where: {
        cartId_sku: {
          cartId: cart.id,
          sku: sku.trim(),
        },
      },
    });

    let isCreated = false;
    const totalQuantity = (existingItem?.quantity ?? 0) + parsedQty;
    const commercial = quote ? await quote(sku.trim(), totalQuantity) : undefined;
    if (commercial && (!Number.isFinite(commercial.amount) || commercial.amount < 0
      || commercial.currency !== cart.currency || !Number.isSafeInteger(commercial.version) || commercial.version < 0)) {
      throw new ConflictException({ code: 'COMMERCE_DATA_UNAVAILABLE', message: 'Cotización no válida' });
    }

    if (existingItem) {
      const newQuantity = existingItem.quantity + parsedQty;
      if (newQuantity > 99) {
        throw new ConflictException({
          code: 'STOCK_LIMIT_REACHED',
          message: 'La cantidad excede el límite permitido de 99 unidades por ítem.',
        });
      }

      await tx.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity, ...(commercial ? {
          unitPriceSnapshot: new Prisma.Decimal(commercial.amount), priceVersion: String(commercial.version), quotedAt: new Date(),
        } : {}) },
      });
    } else {
      isCreated = true;
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          sku: sku.trim(),
          quantity: parsedQty,
          unitPriceSnapshot: new Prisma.Decimal(commercial?.amount ?? 89.9), // MOCK Hito 3
          priceVersion: String(commercial?.version ?? 1),
          quotedAt: new Date(),
        },
      });
    }

    const updatedCart = await tx.cart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
      include: { items: true },
    });

    return {
      status: isCreated ? 201 : 200,
      code: isCreated ? 'ITEM_CREATED' : 'ITEM_INCREMENTED',
      data: {
        cartId: updatedCart.id,
        version: updatedCart.version,
        items: updatedCart.items.map((it) => ({
          sku: it.sku,
          quantity: it.quantity,
          unitPrice: it.unitPriceSnapshot
            ? {
                amount: Number(it.unitPriceSnapshot),
                currency: updatedCart.currency,
                version: parseInt(it.priceVersion || '1', 10),
              }
            : undefined,
        })),
      },
    };
  }

  /**
   * TASK-F019-BE-001: Obtener carrito actual
   */
  async getCurrentCart(params: {
    sessionHash?: string;
    customerId?: string;
  }): Promise<CartSnapshotDto> {
    const { sessionHash, customerId } = params;
    let cart: CartWithItems | null = null;

    if (customerId) {
      cart = await this.prisma.cart.findFirst({
        where: { customerId, state: CartState.ACTIVE },
        include: { items: true },
      });
      if (!cart && sessionHash) {
        cart = await this.prisma.cart.findFirst({
          where: { anonymousSessionHash: sessionHash, state: CartState.ACTIVE },
          include: { items: true },
        });
      }
    } else if (sessionHash) {
      cart = await this.prisma.cart.findFirst({
        where: { anonymousSessionHash: sessionHash, state: CartState.ACTIVE },
        include: { items: true },
      });
    }

    if (!cart) {
      return {
        cartId: null,
        version: 0,
        items: [],
      };
    }

    return {
      cartId: cart.id,
      version: cart.version,
      items: cart.items.map((it) => ({
        sku: it.sku,
        quantity: it.quantity,
        unitPrice: it.unitPriceSnapshot
          ? {
              amount: Number(it.unitPriceSnapshot),
              currency: cart.currency,
              version: parseInt(it.priceVersion || '1', 10),
            }
          : undefined,
      })),
    };
  }
}
