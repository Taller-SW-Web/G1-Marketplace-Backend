import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
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
  product?: {
    slug: string;
    name: string;
    imageUrl?: string;
  };
  unitPrice?: {
    amount: number;
    currency: string;
    version: number;
  };
  availability?: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNAVAILABLE';
  attention?: string | null;
}

export interface CartSnapshotDto {
  cartId: string | null;
  version: number;
  items: CartItemDto[];
  subtotal?: {
    amount: number;
    currency: string;
  } | null;
}


export interface MergeAdjustmentDto {
  sku: string;
  requestedQuantity: number;
  confirmedQuantity: number;
  reason: 'STOCK_LIMIT' | 'COMMERCE_POLICY';
}

export interface MoveToWishlistResultDto {
  cartId: string;
  version: number;
  productId: string;
  wishlistCreated: boolean;
}

export interface CartMergeResultDto {
  cartId: string;
  version: number;
  merged: boolean;
  adjustments: MergeAdjustmentDto[];
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

  async getActiveItemQuantity(params: { customerId: string; sku: string }): Promise<number> {
    const item = await this.prisma.cartItem.findFirst({
      where: { sku: params.sku.trim(), cart: { customerId: params.customerId, state: CartState.ACTIVE } },
      select: { quantity: true },
    });
    return item?.quantity ?? 0;
  }

  async addItemInTransaction(tx: Prisma.TransactionClient, params: AddCartParams,
    quote?: (sku: string, totalQuantity: number) => Promise<CommerceQuote>,
    expectedTotalQuantity?: number): Promise<AddItemResult> {
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
    if (expectedTotalQuantity !== undefined && totalQuantity !== expectedTotalQuantity) {
      throw new ConflictException({ code: 'CART_CHANGED_RETRY', message: 'El carrito cambió; vuelve a intentarlo' });
    }
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
   * TASK-F017-BE-001: Actualizar cantidad de un ítem en el carrito
   */
  async updateItemQuantity(
    params: {
      sessionHash?: string;
      customerId?: string;
      sku: string;
      quantity: number;
      expectedVersion?: number;
    },
    quote?: (sku: string, totalQuantity: number) => Promise<CommerceQuote>,
  ): Promise<CartSnapshotDto> {
    return this.prisma.$transaction((tx) => this.updateItemQuantityInTransaction(tx, params, quote));
  }

  async updateItemQuantityInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      sessionHash?: string;
      customerId?: string;
      sku: string;
      quantity: number;
      expectedVersion?: number;
    },
    quote?: (sku: string, totalQuantity: number) => Promise<CommerceQuote>,
  ): Promise<CartSnapshotDto> {
    const { sessionHash, customerId, sku, quantity, expectedVersion } = params;

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
        message: 'La cantidad debe ser un entero entre 1 y 99. La cantidad 0 no es admitida.',
      });
    }

    await this.lockOwner(tx, { sessionHash, customerId });
    const cart = await this.getOrCreateCart(tx, { sessionHash, customerId });

    if (expectedVersion !== undefined && cart.version !== expectedVersion) {
      throw new ConflictException({
        code: 'CART_CONFLICT',
        message: `Conflicto de versión en carrito: versión actual ${cart.version}, versión esperada ${expectedVersion}.`,
      });
    }

    const existingItem = await tx.cartItem.findUnique({
      where: {
        cartId_sku: {
          cartId: cart.id,
          sku: sku.trim(),
        },
      },
    });

    if (!existingItem) {
      throw new NotFoundException({
        code: 'CART_ITEM_NOT_FOUND',
        message: `El ítem con SKU ${sku} no existe en el carrito.`,
      });
    }

    const commercial = quote ? await quote(sku.trim(), parsedQty) : undefined;
    if (commercial && (!Number.isFinite(commercial.amount) || commercial.amount < 0
      || commercial.currency !== cart.currency || !Number.isSafeInteger(commercial.version) || commercial.version < 0)) {
      throw new ConflictException({ code: 'COMMERCE_DATA_UNAVAILABLE', message: 'Cotización no válida' });
    }

    await tx.cartItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: parsedQty,
        updatedAt: new Date(),
        ...(commercial
          ? {
              unitPriceSnapshot: new Prisma.Decimal(commercial.amount),
              priceVersion: String(commercial.version),
            }
          : {}),
      },
    });

    const updatedCart = await tx.cart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
      include: { items: true },
    });

    return {
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
    };
  }

  /**
   * TASK-F018-BE-001 / TASK-F018-DB-001: Quitar un ítem del carrito de forma idempotente (F-018)
   */
  async removeItemFromCart(params: {
    sessionHash?: string;
    customerId?: string;
    sku: string;
    expectedVersion?: number;
  }): Promise<{ mutated: boolean; version: number }> {
    return this.prisma.$transaction(async (tx) => {
      return this.removeItemFromCartInTransaction(tx, params);
    });
  }

  async removeItemFromCartInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      sessionHash?: string;
      customerId?: string;
      sku: string;
      expectedVersion?: number;
    },
  ): Promise<{ mutated: boolean; version: number }> {
    const { sessionHash, customerId, sku, expectedVersion } = params;

    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      throw new BadRequestException({
        code: 'INVALID_SKU',
        message: 'El parámetro sku es requerido.',
      });
    }

    const trimmedSku = sku.trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmedSku)) {
      throw new BadRequestException({
        code: 'INVALID_SKU',
        message: 'Formato de SKU inválido.',
      });
    }

    await this.lockOwner(tx, { sessionHash, customerId });
    const cart = await this.getOrCreateCart(tx, { sessionHash, customerId });

    if (expectedVersion !== undefined && cart.version !== expectedVersion) {
      throw new ConflictException({
        code: 'CART_CONFLICT',
        message: `Conflicto de versión en carrito: versión actual ${cart.version}, versión esperada ${expectedVersion}.`,
      });
    }

    const existingItem = await tx.cartItem.findUnique({
      where: {
        cartId_sku: {
          cartId: cart.id,
          sku: trimmedSku,
        },
      },
    });

    if (!existingItem) {
      // Idempotente (RN-F018-03 / API-CA-F018-01): si ya no existe, resultado final seguro sin mutación
      return { mutated: false, version: cart.version };
    }

    await tx.cartItem.delete({
      where: { id: existingItem.id },
    });

    const updatedCart = await tx.cart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
    });

    return { mutated: true, version: updatedCart.version };
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
        subtotal: null,
      };
    }

    const hasIncompletePrices = cart.items.some((it) => it.unitPriceSnapshot === null);
    const subtotal = (cart.items.length > 0 && !hasIncompletePrices)
      ? {
          amount: Number(
            cart.items.reduce(
              (sum, it) => sum + Number(it.unitPriceSnapshot) * it.quantity,
              0,
            ).toFixed(2),
          ),
          currency: cart.currency,
        }
      : null;

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
        availability: 'AVAILABLE',
        attention: it.unitPriceSnapshot === null ? 'PRECIO_PENDIENTE' : null,
      })),
      subtotal,
    };
  }

  /**
   * TASK-F020-BE-001 / TASK-F020-DB-001: Fusionar carrito anónimo al iniciar sesión (F-020)
   */
  async mergeAnonymousCart(params: {
    customerId: string;
    sessionHash?: string;
  }): Promise<CartMergeResultDto> {
    const { customerId, sessionHash } = params;
    if (!customerId) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }

    if (!sessionHash) {
      const userCart = await this.prisma.cart.findFirst({
        where: { customerId, state: CartState.ACTIVE },
      });
      return {
        cartId: userCart?.id ?? '',
        version: userCart?.version ?? 0,
        merged: false,
        adjustments: [],
      };
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Buscar carrito anónimo activo
      const anonymousCart = await tx.cart.findFirst({
        where: { anonymousSessionHash: sessionHash, state: CartState.ACTIVE },
        include: { items: true },
      });

      // Si no existe carrito anónimo activo o no tiene ítems
      if (!anonymousCart || anonymousCart.items.length === 0) {
        const userCart = await tx.cart.findFirst({
          where: { customerId, state: CartState.ACTIVE },
        });
        return {
          cartId: userCart?.id ?? '',
          version: userCart?.version ?? 0,
          merged: false,
          adjustments: [],
        };
      }

      // 2. Buscar o crear carrito del usuario titular
      let userCart = await tx.cart.findFirst({
        where: { customerId, state: CartState.ACTIVE },
        include: { items: true },
      });

      if (!userCart) {
        userCart = await tx.cart.create({
          data: {
            customerId,
            currency: anonymousCart.currency,
            state: CartState.ACTIVE,
            version: 0,
          },
          include: { items: true },
        });
      }

      const adjustments: MergeAdjustmentDto[] = [];

      // 3. Fusionar cada ítem del carrito anónimo al carrito del usuario (RN-F020-02)
      for (const anonItem of anonymousCart.items) {
        const existingItem = userCart.items.find((it) => it.sku === anonItem.sku);

        if (existingItem) {
          const requestedQuantity = existingItem.quantity + anonItem.quantity;
          const confirmedQuantity = Math.min(99, requestedQuantity);

          if (requestedQuantity > 99) {
            adjustments.push({
              sku: anonItem.sku,
              requestedQuantity,
              confirmedQuantity: 99,
              reason: 'STOCK_LIMIT',
            });
          }

          await tx.cartItem.update({
            where: { id: existingItem.id },
            data: {
              quantity: confirmedQuantity,
              updatedAt: new Date(),
            },
          });
        } else {
          await tx.cartItem.create({
            data: {
              cartId: userCart.id,
              sku: anonItem.sku,
              productId: anonItem.productId,
              variantId: anonItem.variantId,
              quantity: anonItem.quantity,
              unitPriceSnapshot: anonItem.unitPriceSnapshot,
              priceVersion: anonItem.priceVersion,
              quotedAt: anonItem.quotedAt,
            },
          });
        }
      }

      // 4. Incrementar versión del carrito autenticado
      const updatedUserCart = await tx.cart.update({
        where: { id: userCart.id },
        data: {
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      // 5. Marcar carrito anónimo como MERGED y enlazarlo con mergedIntoCartId (RN-F020-01)
      await tx.cart.update({
        where: { id: anonymousCart.id },
        data: {
          state: CartState.MERGED,
          mergedIntoCartId: updatedUserCart.id,
          mergedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return {
        cartId: updatedUserCart.id,
        version: updatedUserCart.version,
        merged: true,
        adjustments,
      };
    });
  }


  /**
   * TASK-F021-BE-001 / TASK-F021-DB-001: Mover ítem del carrito a favoritos (Wishlist) (F-021)
   */
  async moveItemToWishlist(params: {
    customerId: string;
    sku: string;
    expectedVersion?: number;
  }): Promise<MoveToWishlistResultDto> {
    const { customerId, sku, expectedVersion } = params;

    if (!customerId) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Inicia sesión para mover productos a favoritos.',
      });
    }

    if (!sku || typeof sku !== 'string' || sku.trim() === '') {
      throw new BadRequestException({
        code: 'INVALID_SKU',
        message: 'El SKU no puede estar vacío.',
      });
    }

    const trimmedSku = sku.trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(trimmedSku)) {
      throw new BadRequestException({
        code: 'INVALID_SKU',
        message: 'Formato de SKU inválido.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockOwner(tx, { customerId });

      const cart = await tx.cart.findFirst({
        where: { customerId, state: CartState.ACTIVE },
        include: { items: true },
      });

      if (!cart) {
        throw new NotFoundException({
          code: 'CART_ITEM_NOT_FOUND',
          message: `El ítem con SKU ${trimmedSku} no se encuentra en el carrito.`,
        });
      }

      if (expectedVersion !== undefined && cart.version !== expectedVersion) {
        throw new ConflictException({
          code: 'CART_CONFLICT',
          message: `Conflicto de versión en carrito: versión actual ${cart.version}, versión esperada ${expectedVersion}.`,
        });
      }

      const existingItem = cart.items.find((it) => it.sku === trimmedSku);
      if (!existingItem) {
        throw new NotFoundException({
          code: 'CART_ITEM_NOT_FOUND',
          message: `El ítem con SKU ${trimmedSku} no se encuentra en el carrito.`,
        });
      }

      const productId = existingItem.productId || existingItem.sku.replace(/^SKU-/, 'PRD-');

      // RN-F021-03 / RN-F021-04: Verificar o insertar en WishlistItem a nivel productId
      let wishlistCreated = false;
      const existingFavorite = await tx.wishlistItem.findUnique({
        where: {
          customerId_productId: {
            customerId,
            productId,
          },
        },
      });

      if (!existingFavorite) {
        await tx.wishlistItem.create({
          data: {
            customerId,
            productId,
          },
        });
        wishlistCreated = true;
      }

      // Eliminar el ítem del carrito solo tras asegurar el favorito (CA-F021-01)
      await tx.cartItem.delete({
        where: { id: existingItem.id },
      });

      // Incrementar versión del carrito
      const updatedCart = await tx.cart.update({
        where: { id: cart.id },
        data: {
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      return {
        cartId: updatedCart.id,
        version: updatedCart.version,
        productId,
        wishlistCreated,
      };
    });
  }
}
