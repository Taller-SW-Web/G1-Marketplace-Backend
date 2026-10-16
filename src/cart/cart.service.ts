import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cart, CartItem, CartState, Prisma } from '@prisma/client';

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
  async addItemToCart(params: {
    sessionHash?: string;
    customerId?: string;
    sku: string;
    quantity?: number;
  }): Promise<AddItemResult> {
    const { sessionHash, customerId, sku } = params;
    const quantity = params.quantity ?? 1;

    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      throw new BadRequestException({
        code: 'INVALID_SKU',
        message: 'El parámetro sku es requerido.',
      });
    }

    const parsedQty = Number(quantity);
    if (isNaN(parsedQty) || parsedQty < 1 || parsedQty > 99) {
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'La cantidad debe ser un entero entre 1 y 99.',
      });
    }

    return await this.prisma.$transaction(async (tx) => {
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
          data: { quantity: newQuantity },
        });
      } else {
        isCreated = true;
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            sku: sku.trim(),
            quantity: parsedQty,
            unitPriceSnapshot: new Prisma.Decimal(89.9), // MOCK Hito 3
            priceVersion: '1',
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
    });
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
