import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { CartService } from '../cart/cart.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { planReorder, ReorderEligibility } from './reorder-planner';
import { REORDER_COMMERCE_PROVIDER, ReorderCommerceProvider, ReorderResult } from './reorder.types';

@Injectable()
export class ReorderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly cart: CartService,
    private readonly config: ConfigService,
    @Inject(REORDER_COMMERCE_PROVIDER) private readonly commerce: ReorderCommerceProvider,
  ) {}

  async reorder(customerId: string | undefined, orderId: string, idempotencyKey: string, accessToken?: string): Promise<{ data: ReorderResult }> {
    if (!customerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
      throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new BadRequestException({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    }
    if (this.config.get<boolean>('REORDER_ENABLED') !== true
      || this.config.get<string>('REORDER_SOURCE') !== 'mock'
      || this.config.get<string>('NODE_ENV') !== 'test'
      || this.config.get<string>('ORDERS_SOURCE') !== 'mock') {
      throw new ServiceUnavailableException({ error: { code: 'REORDER_UNAVAILABLE' } });
    }

    const orderResult = await this.orders.getMyOrder(orderId, accessToken);
    const order = orderResult.data;
    if (!['PAGADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'].includes(order.state)) {
      throw new NotFoundException({ error: { code: 'ORDER_NOT_AVAILABLE' } });
    }

    const requestKey = { customerId_externalOrderId_idempotencyKey: { customerId, externalOrderId: orderId, idempotencyKey } };
    const previous = await this.prisma.cartReorderOperation.findUnique({ where: requestKey });
    if (previous) return this.replayForOwner(previous, customerId);

    const cartBefore = await this.cart.getCurrentCart({ customerId });
    const cartQuantities = new Map(cartBefore.items.map((item) => [item.sku, item.quantity]));
    const requested = new Map<string, number>();
    for (const line of order.lines) requested.set(line.sku, (requested.get(line.sku) ?? 0) + line.quantity);

    const checks = new Map<string, Awaited<ReturnType<ReorderCommerceProvider['checkSku']>>>();
    try {
      await Promise.all([...requested].map(async ([sku, quantity]) => {
        checks.set(sku, await this.commerce.checkSku({
          sku,
          requestedQuantity: quantity,
          currentQuantity: cartQuantities.get(sku) ?? 0,
        }));
      }));
    } catch {
      throw new ServiceUnavailableException({ error: { code: 'COMMERCE_DATA_UNAVAILABLE' } });
    }
    const eligibility = new Map<string, ReorderEligibility>();
    for (const [sku, result] of checks) {
      eligibility.set(sku, result.status === 'AVAILABLE'
        ? { status: 'AVAILABLE', maxAdditionalQuantity: result.maxAdditionalQuantity }
        : { status: result.status });
    }
    const planned = planReorder(order.lines, cartBefore.items, eligibility);

    try {
      const data = await this.prisma.$transaction(async (tx) => {
        await this.cart.lockOwner(tx, { customerId });
        const existing = await tx.cartReorderOperation.findUnique({ where: requestKey });
        if (existing) return this.replayForOwner(existing, customerId).data;

        const cart = await this.cart.getOrCreateCart(tx, { customerId });
        const isNewEmptyCart = cartBefore.cartId === null && cart.version === 1 && cart.items.length === 0;
        if (!isNewEmptyCart && (cart.id !== cartBefore.cartId || cart.version !== cartBefore.version)) {
          throw new ConflictException({ error: { code: 'CART_CONFLICT' } });
        }

        for (const item of planned.toAdd) {
          const commercial = checks.get(item.sku);
          if (!commercial || commercial.status !== 'AVAILABLE') {
            throw new ServiceUnavailableException({ error: { code: 'COMMERCE_DATA_UNAVAILABLE' } });
          }
          await this.cart.addItemInTransaction(tx, { customerId, sku: item.sku, quantity: item.quantity }, undefined, commercial.quote);
        }
        const finalCart = await tx.cart.findUnique({ where: { id: cart.id } });
        if (!finalCart) throw new ConflictException({ error: { code: 'CART_CONFLICT' } });
        const result: ReorderResult = {
          cartId: finalCart.id,
          version: finalCart.version,
          added: planned.toAdd,
          adjustments: planned.adjustments,
        };
        await tx.cartReorderOperation.create({
          data: {
            externalOrderId: orderId,
            customerId,
            idempotencyKey,
            cartId: finalCart.id,
            result: result as unknown as Prisma.InputJsonValue,
          },
        });
        return result;
      });
      return { data };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      const raced = await this.prisma.cartReorderOperation.findUnique({ where: requestKey });
      if (raced) return this.replayForOwner(raced, customerId);
      throw error;
    }
  }

  private replayForOwner(receipt: { customerId: string; result: unknown }, customerId: string): { data: ReorderResult } {
    if (receipt.customerId !== customerId) throw new NotFoundException({ error: { code: 'ORDER_NOT_AVAILABLE' } });
    return { data: receipt.result as ReorderResult };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
