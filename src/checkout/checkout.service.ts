import {
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CheckoutOperationState, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CheckoutContactDto } from './dto/contact.dto';
import { CreateDeliveryAddressDto } from './dto/delivery-address.dto';
import { ApplyBenefitDto, CreateQuoteDto, PrepareCheckoutDto } from './dto/quote.dto';
import {
  CheckoutOperationView,
  CheckoutOperationStatusView,
  CheckoutQuote,
  DeliveryAddress,
  QuoteLine,
  SalesOrder,
} from './checkout.types';
import { MarketplaceGateway } from './external/marketplace.gateway';
import { ProviderError } from './external/provider-error';
import { QuotesService } from './quotes.service';

const IDEMPOTENCY_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALES_ORDER_ID = /^PED-\d{4}-\d{5}$/;

interface ApiResult<T> {
  status: number;
  data: T;
}

interface PreparedContext {
  quoteId: string;
  cartVersion: number;
  addressId: string;
  expiresAt: number;
  total: CheckoutQuote['total'];
  lines: QuoteLine[];
  revalidatedAt?: string;
}

@Injectable()
export class CheckoutService {
  private readonly customerContextLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MarketplaceGateway,
    private readonly quotes: QuotesService,
  ) {}

  async listAddresses(accessToken: string): Promise<DeliveryAddress[]> {
    try {
      return await this.gateway.listAddresses(accessToken);
    } catch (error) {
      this.throwProviderError(error, 'ADDRESS_SERVICE_UNAVAILABLE');
    }
  }

  async createAddress(
    customerId: string,
    accessToken: string,
    input: CreateDeliveryAddressDto,
  ): Promise<DeliveryAddress> {
    try {
      const address = await this.gateway.createAddress(accessToken, input);
      return await this.withCustomerContextLock(customerId, async () => {
        this.quotes.invalidate(customerId);
        await this.invalidatePreparedOperations(customerId);
        return address;
      });
    } catch (error) {
      this.throwProviderError(error, 'ADDRESS_SERVICE_UNAVAILABLE');
    }
  }

  async createQuote(
    customerId: string,
    accessToken: string,
    input: CreateQuoteDto,
  ): Promise<CheckoutQuote> {
    const cart = await this.findActiveCart(customerId);
    if (!cart) this.fail(409, 'CART_NOT_FOUND');
    if (cart.version !== input.cartVersion) this.fail(409, 'CART_CHANGED');
    if (cart.items.length === 0) this.fail(409, 'CART_EMPTY');

    let addresses: DeliveryAddress[];
    try {
      addresses = await this.gateway.listAddresses(accessToken);
    } catch (error) {
      this.throwProviderError(error, 'ADDRESS_SERVICE_UNAVAILABLE');
    }
    const address = addresses.find((item) => item.addressId === input.addressId);
    if (!address) throw new NotFoundException({ error: { code: 'ADDRESS_NOT_FOUND' } });

    let quote: CheckoutQuote;
    try {
      quote = await this.gateway.createQuote({
        address,
        addressId: address.addressId,
        cartVersion: cart.version,
        lines: cart.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
      });
    } catch (error) {
      this.throwProviderError(error, 'QUOTE_UNAVAILABLE');
    }
    this.assertValidQuote(quote, 'QUOTE_UNAVAILABLE');

    return this.withCustomerContextLock(customerId, async () => {
      await this.invalidatePreparedOperations(customerId);
      return this.quotes.replace(customerId, quote);
    });
  }

  async applyBenefit(customerId: string, input: ApplyBenefitDto): Promise<CheckoutQuote> {
    const currentQuote = this.quotes.get(customerId, input.quoteId);
    if (!currentQuote) this.fail(409, 'QUOTE_EXPIRED');
    const couponCode = input.couponCode?.trim() || undefined;
    if (couponCode && !/^[A-Za-z0-9_-]{3,30}$/.test(couponCode)) {
      this.fail(400, 'INVALID_COUPON_FORMAT');
    }

    let nextQuote: CheckoutQuote;
    try {
      nextQuote = await this.gateway.applyBenefit(currentQuote, couponCode);
    } catch (error) {
      this.throwProviderError(error, 'BENEFITS_UNAVAILABLE');
    }
    this.assertValidQuote(nextQuote, 'BENEFITS_UNAVAILABLE');
    return this.withCustomerContextLock(customerId, async () => {
      if (!this.quotes.get(customerId, input.quoteId)) {
        this.fail(409, 'QUOTE_EXPIRED');
      }
      await this.invalidatePreparedOperations(customerId);
      return this.quotes.replace(customerId, nextQuote);
    });
  }

  async prepare(
    customerId: string,
    input: PrepareCheckoutDto,
    idempotencyKey: string | undefined,
  ): Promise<CheckoutOperationView> {
    this.assertIdempotencyKey(idempotencyKey, false);
    if (!input.simulationConfirmed) this.fail(400, 'SIMULATION_NOT_CONFIRMED');
    let operation = await this.prisma.checkoutOperation.findUnique({
      where: {
        customerId_idempotencyKey: { customerId, idempotencyKey: idempotencyKey! },
      },
    });
    let context: PreparedContext | null = null;

    if (operation) {
      if (operation.state === CheckoutOperationState.FAILED) {
        this.fail(409, operation.failureCode ?? 'PREPARATION_FAILED');
      }
      if (operation.state !== CheckoutOperationState.PREPARING &&
          operation.state !== CheckoutOperationState.PREPARED) {
        return this.operationView(operation);
      }
      context = this.readPreparedContext(operation);
      if (!context) this.fail(409, 'PREPARATION_CONTEXT_UNAVAILABLE');
      if (operation.requestFingerprint !== this.preparationFingerprint(operation.cartId, context, input)) {
        this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
      }
    } else {
      const quote = this.quotes.get(customerId, input.quoteId);
      if (!quote) this.fail(409, 'QUOTE_EXPIRED');
      if (quote.cartVersion !== input.cartVersion) this.fail(409, 'CART_CHANGED');
      const cart = await this.findActiveCart(customerId);
      if (!cart) this.fail(409, 'CART_NOT_FOUND');
      if (cart.version !== input.cartVersion) this.fail(409, 'CART_CHANGED');
      const preparedContext = this.createPreparedContext(quote, cart.version);
      context = preparedContext;
      const fingerprint = this.preparationFingerprint(cart.id, preparedContext, input);
      try {
        operation = await this.withCustomerContextLock(customerId, async () => {
          if (!this.quotes.get(customerId, preparedContext.quoteId)) {
            this.fail(409, 'QUOTE_EXPIRED');
          }
          return this.prisma.checkoutOperation.create({
            data: {
              customerId,
              cartId: cart.id,
              idempotencyKey: idempotencyKey!,
              requestFingerprint: fingerprint,
              state: CheckoutOperationState.PREPARING,
              ...this.preparedContextData(preparedContext),
            },
          });
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        operation = await this.prisma.checkoutOperation.findUnique({
          where: {
            customerId_idempotencyKey: { customerId, idempotencyKey: idempotencyKey! },
          },
        });
        if (!operation) {
          this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
        }
        if (operation.state === CheckoutOperationState.FAILED) {
          this.fail(409, operation.failureCode ?? 'PREPARATION_FAILED');
        }
        if (operation.state !== CheckoutOperationState.PREPARING &&
            operation.state !== CheckoutOperationState.PREPARED) {
          return this.operationView(operation);
        }
        context = this.readPreparedContext(operation);
        if (!context) this.fail(409, 'PREPARATION_CONTEXT_UNAVAILABLE');
        if (operation.requestFingerprint !== this.preparationFingerprint(operation.cartId, context, input)) {
          this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
        }
      }
    }

    if (!operation || !context) this.fail(409, 'PREPARATION_CONTEXT_UNAVAILABLE');
    if (context.expiresAt <= Date.now()) {
      await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: { state: CheckoutOperationState.FAILED, failureCode: 'QUOTE_EXPIRED', completedAt: new Date() },
      });
      this.fail(409, 'QUOTE_EXPIRED');
    }
    if (operation.state === CheckoutOperationState.PREPARED) return this.operationView(operation);

    const cart = await this.prisma.cart.findFirst({
      where: { id: operation.cartId, customerId, state: 'ACTIVE' },
    });
    if (!cart || cart.version !== context.cartVersion) {
      await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: { state: CheckoutOperationState.FAILED, failureCode: 'REVALIDATION_CHANGED', completedAt: new Date() },
      });
      this.fail(409, 'REVALIDATION_CHANGED');
    }

    let revalidation: { available: boolean; revalidatedAt: string };
    try {
      revalidation = await this.gateway.revalidate(context.lines);
    } catch (error) {
      // Preserve PREPARING so the same idempotency key can retry after provider recovery.
      this.throwProviderError(error, 'REVALIDATION_UNAVAILABLE');
    }
    if (!revalidation.available) {
      operation = await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.FAILED,
          failureCode: 'STOCK_NOT_AVAILABLE',
          completedAt: new Date(),
        },
      });
      this.fail(409, 'STOCK_NOT_AVAILABLE');
    }

    const latestCart = await this.prisma.cart.findFirst({
      where: { id: operation.cartId, customerId, state: 'ACTIVE' },
    });
    if (!latestCart || latestCart.version !== context.cartVersion) {
      await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.FAILED,
          failureCode: 'REVALIDATION_CHANGED',
          completedAt: new Date(),
        },
      });
      this.fail(409, 'REVALIDATION_CHANGED');
    }

    operation = await this.withCustomerContextLock(customerId, async () => {
      const finalized = await this.prisma.checkoutOperation.updateMany({
        where: {
          id: operation!.id,
          customerId,
          state: CheckoutOperationState.PREPARING,
          preparedQuoteId: context!.quoteId,
          preparedCartVersion: context!.cartVersion,
        },
        data: {
          state: CheckoutOperationState.PREPARED,
          revalidatedAt: new Date(revalidation.revalidatedAt),
        },
      });
      if (!finalized.count) {
        const latest = await this.prisma.checkoutOperation.findUnique({ where: { id: operation!.id } });
        if (
          latest?.state === CheckoutOperationState.PREPARED &&
          latest.preparedQuoteId === context!.quoteId &&
          latest.preparedCartVersion === context!.cartVersion
        ) return latest;
        this.fail(409, 'REVALIDATION_CHANGED');
      }

      const prepared = await this.prisma.checkoutOperation.findUnique({ where: { id: operation!.id } });
      if (!prepared) this.fail(409, 'PREPARATION_CONTEXT_UNAVAILABLE');
      return prepared;
    });
    return this.operationView(operation, revalidation.revalidatedAt);
  }

  async createOrder(
    customerId: string,
    input: { checkoutOperationId: string; contact: CheckoutContactDto },
    idempotencyKey: string | undefined,
  ): Promise<ApiResult<CheckoutOperationView>> {
    this.assertIdempotencyKey(idempotencyKey, true);
    let operation = await this.prisma.checkoutOperation.findFirst({
      where: { id: input.checkoutOperationId, customerId },
    });
    if (!operation) throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });
    const context = this.readPreparedContext(operation);

    const requestFingerprint = this.fingerprint({
      checkoutOperationId: operation.id,
      idempotencyKey,
      contact: input.contact,
    });
    const hasOrderSubmission = Boolean(
      operation.orderIdempotencyKey ||
      operation.externalOrderId ||
      operation.state === CheckoutOperationState.SUBMITTED ||
      operation.state === CheckoutOperationState.SUCCEEDED,
    );
    if (
      hasOrderSubmission &&
      (operation.requestFingerprint !== requestFingerprint ||
        (operation.orderIdempotencyKey && operation.orderIdempotencyKey !== idempotencyKey))
    ) {
      this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
    }
    if (operation.state === CheckoutOperationState.PREPARED) {
      if (!context) this.fail(409, 'PREPARATION_CONTEXT_UNAVAILABLE');
      if (context.expiresAt <= Date.now()) {
        await this.prisma.checkoutOperation.update({
          where: { id: operation.id },
          data: {
            state: CheckoutOperationState.FAILED,
            failureCode: 'QUOTE_EXPIRED',
            completedAt: new Date(),
          },
        });
        this.fail(409, 'QUOTE_EXPIRED');
      }
      const cart = await this.prisma.cart.findFirst({
        where: { id: operation.cartId, customerId, state: 'ACTIVE' },
      });
      if (!cart || cart.version !== context.cartVersion) {
        operation = await this.prisma.checkoutOperation.update({
          where: { id: operation.id },
          data: {
            state: CheckoutOperationState.FAILED,
            failureCode: 'CHECKOUT_CONTEXT_CHANGED',
            completedAt: new Date(),
          },
        });
        this.fail(409, 'OPERATION_NOT_PREPARED');
      }
    }

    if (operation.state === CheckoutOperationState.FAILED) {
      this.fail(409, operation.failureCode ?? 'ORDER_NOT_COMPLETED');
    }
    if (operation.state === CheckoutOperationState.SUCCEEDED) {
      if (!operation.externalOrderId) this.fail(409, 'PREPARATION_CONTEXT_UNAVAILABLE');
      return this.refreshOrder(operation);
    }
    if (
      operation.state !== CheckoutOperationState.PREPARED &&
      operation.state !== CheckoutOperationState.SUBMITTED
    ) {
      this.fail(409, 'OPERATION_NOT_PREPARED');
    }
    if (
      operation.state === CheckoutOperationState.SUBMITTED &&
      !operation.externalOrderId &&
      !context
    ) {
      this.fail(409, 'PREPARATION_CONTEXT_UNAVAILABLE');
    }

    if (operation.state === CheckoutOperationState.PREPARED) {
      let claimed: { count: number };
      try {
        claimed = await this.prisma.checkoutOperation.updateMany({
          where: {
            id: operation.id,
            customerId,
            state: CheckoutOperationState.PREPARED,
          },
          data: {
            state: CheckoutOperationState.SUBMITTED,
            requestFingerprint,
            orderIdempotencyKey: idempotencyKey,
          },
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error)) this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
        throw error;
      }
      operation = await this.prisma.checkoutOperation.findFirst({
        where: { id: operation.id, customerId },
      });
      if (!operation) throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });
      if (!claimed.count && operation.requestFingerprint !== requestFingerprint) {
        this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
      }
    }

    if (!operation.externalOrderId) {
      let createdOrder: SalesOrder;
      try {
        createdOrder = await this.gateway.createOrder({
          customerId,
          checkoutOperationId: operation.id,
          // Persist the client key for safe replay; use operation UUID only for legacy submissions.
          idempotencyKey: operation.orderIdempotencyKey ?? operation.id,
          contact: input.contact,
          total: context!.total,
        });
      } catch (error) {
        this.throwProviderError(error, 'ORDER_CREATION_PENDING');
      }
      this.assertValidSalesOrder(createdOrder);
    }

    const result = await this.refreshOrder(operation);
    return result;
  }

  async getOperation(
    customerId: string,
    operationId: string,
  ): Promise<ApiResult<CheckoutOperationStatusView>> {
    const operation = await this.prisma.checkoutOperation.findFirst({
      where: { id: operationId, customerId },
    });
    if (!operation) throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });

    if (operation.state === CheckoutOperationState.PREPARED) {
      this.fail(409, 'ORDER_NOT_SUBMITTED');
    }
    if (operation.state === CheckoutOperationState.SUBMITTED) {
      const result = await this.refreshOrder(operation);
      return { status: result.status, data: this.operationStatusView(result.data) };
    }
    if (
      operation.externalOrderId &&
      (operation.state === CheckoutOperationState.SUCCEEDED ||
        operation.state === CheckoutOperationState.FAILED)
    ) {
      try {
        const order = await this.gateway.getOrder(operation.externalOrderId);
        return {
          status: 200,
          data: this.operationStatusView({
            ...this.operationView(operation),
            orderId: order.pedidoId,
            orderState: order.estado,
            total: order.total,
            createdAt: order.createdAt,
          }),
        };
      } catch (error) {
        // Never return a final success without the authoritative Sales order fields required by F-027.
        this.throwProviderError(error, 'SALES_UNAVAILABLE');
      }
    }
    return { status: 200, data: this.operationStatusView(this.operationView(operation)) };
  }

  private operationStatusView(operation: CheckoutOperationView): CheckoutOperationStatusView {
    const order = operation.orderId && operation.orderState && operation.total && operation.createdAt
      ? {
          orderId: operation.orderId,
          state: operation.orderState,
          total: operation.total,
          createdAt: operation.createdAt,
        }
      : undefined;
    return {
      state: operation.state,
      ...(order ? { order } : {}),
      ...(operation.failureCode ? { failureCode: operation.failureCode } : {}),
      ...(operation.recoveryRequired ? { recoveryRequired: true } : {}),
    };
  }

  private async refreshOrder(operation: Prisma.CheckoutOperationGetPayload<object>): Promise<ApiResult<CheckoutOperationView>> {
    if (!operation.externalOrderId && !operation.orderIdempotencyKey) {
      return {
        status: 202,
        data: { ...this.operationView(operation), recoveryRequired: true },
      };
    }

    let order: SalesOrder;
    try {
      order = operation.externalOrderId
        ? await this.gateway.getOrder(operation.externalOrderId)
        : await this.gateway.getOrderByIdempotencyKey(operation.orderIdempotencyKey!, operation.customerId);
    } catch {
      // The provider may be temporarily unreachable; never infer PAGADO from a timeout.
      return {
        status: 202,
        data: { ...this.operationView(operation), recoveryRequired: true },
      };
    }
    this.assertValidSalesOrder(order);

    if (order.estado === 'PAGADO') {
      const updated = await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.SUCCEEDED,
          externalOrderId: order.pedidoId,
          failureCode: null,
          completedAt: new Date(),
        },
      });
      return {
        status: 200,
        data: {
          ...this.operationView(updated),
          orderId: order.pedidoId,
          orderState: order.estado,
          total: order.total,
          createdAt: order.createdAt,
        },
      };
    }
    if (order.estado === 'ANULADO') {
      const updated = await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.FAILED,
          externalOrderId: null,
          failureCode: order.failureCode ?? 'PAGO_NO_COMPLETADO',
          completedAt: new Date(),
        },
      });
      return {
        status: 200,
        data: {
          ...this.operationView(updated),
          orderId: order.pedidoId,
          orderState: order.estado,
          total: order.total,
          createdAt: order.createdAt,
          failureCode: updated.failureCode ?? undefined,
        },
      };
    }
    return {
      status: 202,
      data: {
        ...this.operationView(operation),
        orderId: order.pedidoId,
        orderState: order.estado,
        total: order.total,
        createdAt: order.createdAt,
      },
    };
  }

  private async findActiveCart(customerId: string) {
    let cart = await this.prisma.cart.findFirst({
      where: { customerId, state: 'ACTIVE' },
      include: { items: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (
      !cart &&
      (process.env.USE_MOCKS === 'true' || process.env.NODE_ENV !== 'production')
    ) {
      const anonCart = await this.prisma.cart.findFirst({
        where: { customerId: null, state: 'ACTIVE' },
        include: { items: true },
        orderBy: { updatedAt: 'desc' },
      });
      if (anonCart) {
        cart = await this.prisma.cart.update({
          where: { id: anonCart.id },
          data: { customerId },
          include: { items: true },
        });
      }
    }

    return cart;
  }

  private createPreparedContext(quote: CheckoutQuote, cartVersion: number): PreparedContext {
    return {
      quoteId: quote.quoteId,
      cartVersion,
      addressId: quote.addressId,
      expiresAt: Date.parse(quote.expiresAt),
      total: quote.total,
      lines: quote.lines,
    };
  }

  private preparedContextData(context: PreparedContext) {
    return {
      preparedQuoteId: context.quoteId,
      preparedCartVersion: context.cartVersion,
      preparedAddressId: context.addressId,
      preparedExpiresAt: new Date(context.expiresAt),
      preparedTotalAmount: context.total.amount,
      preparedTotalCurrency: context.total.currency,
      preparedLines: context.lines as unknown as Prisma.InputJsonValue,
    };
  }

  private readPreparedContext(operation: {
    preparedQuoteId?: string | null;
    preparedCartVersion?: number | null;
    preparedAddressId?: string | null;
    preparedExpiresAt?: Date | null;
    preparedTotalAmount?: Prisma.Decimal | number | null;
    preparedTotalCurrency?: string | null;
    preparedLines?: Prisma.JsonValue | null;
    revalidatedAt?: Date | null;
  }): PreparedContext | null {
    const lines = operation.preparedLines;
    const totalAmount = Number(operation.preparedTotalAmount);
    if (
      !operation.preparedQuoteId ||
      operation.preparedCartVersion === null || operation.preparedCartVersion === undefined ||
      !operation.preparedAddressId ||
      !operation.preparedExpiresAt ||
      !Number.isFinite(operation.preparedExpiresAt.getTime()) ||
      operation.preparedTotalAmount === null || operation.preparedTotalAmount === undefined ||
      !Number.isFinite(totalAmount) || totalAmount < 0 ||
      operation.preparedTotalCurrency !== 'PEN' ||
      !Array.isArray(lines) ||
      lines.length === 0 ||
      !lines.every((line) => typeof line === 'object' && line !== null &&
        'sku' in line && typeof line.sku === 'string' && line.sku.trim().length > 0 &&
        'quantity' in line && typeof line.quantity === 'number' &&
        Number.isInteger(line.quantity) && line.quantity > 0)
    ) return null;
    return {
      quoteId: operation.preparedQuoteId,
      cartVersion: operation.preparedCartVersion,
      addressId: operation.preparedAddressId,
      expiresAt: operation.preparedExpiresAt.getTime(),
      total: {
        amount: totalAmount,
        currency: operation.preparedTotalCurrency,
      },
      lines: lines.map((line) => ({
        sku: (line as { sku: string }).sku,
        quantity: (line as { quantity: number }).quantity,
      })),
      ...(operation.revalidatedAt ? { revalidatedAt: operation.revalidatedAt.toISOString() } : {}),
    };
  }

  private preparationFingerprint(
    cartId: string,
    context: PreparedContext,
    input: PrepareCheckoutDto,
  ): string {
    return this.fingerprint({
      quoteId: context.quoteId,
      cartId,
      cartVersion: context.cartVersion,
      addressId: context.addressId,
      simulationConfirmed: input.simulationConfirmed,
      requestedQuoteId: input.quoteId,
      requestedCartVersion: input.cartVersion,
    });
  }

  private assertValidQuote(quote: CheckoutQuote, code: string): void {
    const expiresAt = Date.parse(quote.expiresAt);
    const validMoney = (money: { amount: number; currency: string } | undefined) =>
      Boolean(money && Number.isFinite(money.amount) && money.amount >= 0 && money.currency === 'PEN');
    if (
      !quote.quoteId ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      !quote.addressId?.trim() ||
      !Number.isInteger(quote.cartVersion) || quote.cartVersion < 0 ||
      !validMoney(quote.total) ||
      !validMoney(quote.subtotal) ||
      !validMoney(quote.discount) ||
      !validMoney(quote.shipping) ||
      !Number.isFinite(quote.shipping?.estimatedDays) || quote.shipping.estimatedDays < 0 ||
      !Array.isArray(quote.lines) || quote.lines.length === 0 ||
      !quote.lines.every((line) => Boolean(line.sku?.trim()) && Number.isInteger(line.quantity) && line.quantity > 0)
    ) {
      this.fail(503, code);
    }
  }

  private assertValidSalesOrder(order: SalesOrder): void {
    if (
      !order ||
      typeof order.pedidoId !== 'string' || !SALES_ORDER_ID.test(order.pedidoId) ||
      !['CREADO', 'PAGADO', 'ANULADO'].includes(order.estado) ||
      !Number.isFinite(order.total?.amount) || order.total.amount < 0 ||
      order.total.currency !== 'PEN' ||
      typeof order.createdAt !== 'string' || !Number.isFinite(Date.parse(order.createdAt))
    ) {
      this.fail(503, 'SALES_UNAVAILABLE');
    }
  }

  private async invalidatePreparedOperations(customerId: string): Promise<void> {
    await this.prisma.checkoutOperation.updateMany({
      where: {
        customerId,
        state: { in: [CheckoutOperationState.PREPARING, CheckoutOperationState.PREPARED] },
      },
      data: {
        state: CheckoutOperationState.FAILED,
        failureCode: 'CHECKOUT_CONTEXT_CHANGED',
        completedAt: new Date(),
      },
    });
  }

  private async withCustomerContextLock<T>(customerId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.customerContextLocks.get(customerId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.customerContextLocks.set(customerId, current);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.customerContextLocks.get(customerId) === current) {
        this.customerContextLocks.delete(customerId);
      }
    }
  }

  private assertIdempotencyKey(
    value: string | undefined,
    requireV4: boolean,
  ): asserts value is string {
    if (!value || !(requireV4 ? IDEMPOTENCY_UUID_V4 : IDEMPOTENCY_UUID).test(value)) {
      this.fail(400, 'IDEMPOTENCY_KEY_REQUIRED');
    }
  }

  private operationView(operation: {
    id: string;
    state: CheckoutOperationState;
    externalOrderId: string | null;
    failureCode: string | null;
    revalidatedAt?: Date | null;
  }, revalidatedAt?: string): CheckoutOperationView & { simulationConsent?: string; revalidatedAt?: string } {
    const state =
      operation.state === CheckoutOperationState.PREPARING ? 'PREPARED' : operation.state;
    return {
      checkoutOperationId: operation.id,
      state: state as CheckoutOperationView['state'],
      ...(operation.externalOrderId ? { orderId: operation.externalOrderId } : {}),
      ...(operation.failureCode ? { failureCode: operation.failureCode } : {}),
      ...(operation.state === CheckoutOperationState.PREPARED
        ? {
            simulationConsent: 'RECORDED',
            ...((revalidatedAt ?? operation.revalidatedAt?.toISOString())
              ? { revalidatedAt: revalidatedAt ?? operation.revalidatedAt!.toISOString() }
              : {}),
          }
        : {}),
    };
  }

  private fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private throwProviderError(error: unknown, fallbackCode: string): never {
    if (!(error instanceof ProviderError)) {
      if (fallbackCode === 'ORDER_CREATION_PENDING') this.fail(409, fallbackCode);
      throw new ServiceUnavailableException({ error: { code: fallbackCode } });
    }
    if (fallbackCode === 'ORDER_CREATION_PENDING' && error.status >= 500) {
      this.fail(409, 'ORDER_CREATION_PENDING');
    }
    if (fallbackCode === 'ADDRESS_SERVICE_UNAVAILABLE' && error.status >= 400 && error.status < 500) {
      this.fail(400, 'ADDRESS_VALIDATION_ERROR');
    }
    const maps: Record<string, { status: number; code: string }> = {
      ADDRESS_SERVICE_UNAVAILABLE: { status: 503, code: 'ADDRESS_SERVICE_UNAVAILABLE' },
      ADDRESS_TIMEOUT: { status: 503, code: 'ADDRESS_SERVICE_UNAVAILABLE' },
      NO_SHIPPING_COVERAGE: { status: 409, code: 'NO_SHIPPING_COVERAGE' },
      LINE_NOT_AVAILABLE: { status: 409, code: 'LINE_NOT_AVAILABLE' },
      QUOTE_UNAVAILABLE: { status: 503, code: 'QUOTE_UNAVAILABLE' },
      QUOTE_TIMEOUT: { status: 503, code: 'QUOTE_UNAVAILABLE' },
      COUPON_NOT_APPLICABLE: { status: 422, code: 'COUPON_NOT_APPLICABLE' },
      BENEFITS_UNAVAILABLE: { status: 503, code: 'BENEFITS_UNAVAILABLE' },
      BENEFITS_TIMEOUT: { status: 503, code: 'BENEFITS_UNAVAILABLE' },
      REVALIDATION_UNAVAILABLE: { status: 503, code: 'REVALIDATION_UNAVAILABLE' },
      REVALIDATION_TIMEOUT: { status: 503, code: 'REVALIDATION_UNAVAILABLE' },
      SALES_UNAVAILABLE: { status: 503, code: 'SALES_UNAVAILABLE' },
      SALES_TIMEOUT: { status: 409, code: 'ORDER_CREATION_PENDING' },
      SALES_STATUS_TIMEOUT: { status: 503, code: 'SALES_UNAVAILABLE' },
      IDEMPOTENCY_KEY_REUSED: { status: 409, code: 'IDEMPOTENCY_KEY_REUSED' },
    };
    const mapped = maps[error.code];
    if (mapped) this.fail(mapped.status, mapped.code);
    if (error.status === 404 && error.code === 'ORDER_NOT_FOUND') {
      this.fail(503, 'SALES_UNAVAILABLE');
    }
    this.fail(503, fallbackCode);
  }

  private fail(status: number, code: string): never {
    throw new HttpException({ error: { code } }, status);
  }
}
