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
  Money,
  SalesOrder,
} from './checkout.types';
import { MarketplaceGateway } from './external/marketplace.gateway';
import { ProviderError } from './external/provider-error';
import { QuotesService } from './quotes.service';

const IDEMPOTENCY_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SALES_ORDER_ID = /^PED-\d{4}-\d{5}$/;
const G5_POLL_INTERVAL_MS = 2500;
const G5_POLL_MAX_MS = 60_000;

/**
 * Tiempo máximo que el BFF espera a que Ventas confirme el estado del pedido antes de responder 202.
 * Configurable con G5_ORDER_POLL_MAX_MS (1 000 a 60 000 ms); un valor ausente o inválido conserva los 60 s.
 */
/**
 * Presupuesto total (ms) de una creación de pedido: token técnico + alta en Ventas + espera del estado.
 * Con G5_ORDER_TOTAL_BUDGET_MS (5 000 a 120 000 ms) la espera del estado se recorta para no superarlo; sin la variable
 * o con un valor inválido no hay presupuesto y solo rige G5_ORDER_POLL_MAX_MS.
 */
export function orderTotalBudgetMs(env: NodeJS.ProcessEnv = process.env): number | undefined {
  const raw = env.G5_ORDER_TOTAL_BUDGET_MS;
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 5_000 && value <= 120_000 ? value : undefined;
}

export function orderPollMaxMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.G5_ORDER_POLL_MAX_MS;
  if (raw === undefined || raw === '') return G5_POLL_MAX_MS;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1_000 && value <= G5_POLL_MAX_MS ? value : G5_POLL_MAX_MS;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface ApiResult<T> {
  status: number;
  data: T;
  retryAfterSeconds?: number;
}

interface PreparedContext {
  quoteId: string;
  cartVersion: number;
  addressId: string;
  expiresAt: number;
  total: CheckoutQuote['total'];
  lines: QuoteLine[];
  quoteSnapshot?: {
    subtotal: Money;
    discount: Money;
    shipping: CheckoutQuote['shipping'];
    selectedBenefit?: CheckoutQuote['selectedBenefit'];
  };
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

  async listAddresses(customerId: string, accessToken: string): Promise<DeliveryAddress[]> {
    try {
      return await this.gateway.listAddresses(customerId, accessToken);
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
      const address = await this.gateway.createAddress(customerId, accessToken, input);
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
    sessionHash?: string,
  ): Promise<CheckoutQuote> {
    const cart = await this.findActiveCart(customerId, sessionHash);
    if (!cart) this.fail(409, 'CART_NOT_FOUND');
    if (cart.version !== input.cartVersion) this.fail(409, 'CART_CHANGED');
    if (cart.items.length === 0) this.fail(409, 'CART_EMPTY');

    let addresses: DeliveryAddress[];
    try {
      addresses = await this.gateway.listAddresses(customerId, accessToken);
    } catch (error) {
      this.throwProviderError(error, 'ADDRESS_SERVICE_UNAVAILABLE');
    }
    const address = addresses.find((item) => item.addressId === input.addressId);
    if (!address) throw new NotFoundException({ error: { code: 'ADDRESS_NOT_FOUND' } });

    const lines = cart.items.map((item) => ({ sku: item.sku, quantity: item.quantity }));
    let quote: CheckoutQuote;
    try {
      quote = await this.gateway.createQuote({
        address,
        addressId: address.addressId,
        cartVersion: cart.version,
        lines,
      }, customerId);
    } catch (error) {
      this.throwProviderError(error, 'QUOTE_UNAVAILABLE');
    }
    this.assertValidQuote(quote, 'QUOTE_UNAVAILABLE');
    this.assertQuoteContext(quote, {
      addressId: address.addressId,
      cartVersion: cart.version,
      lines,
    }, 'QUOTE_UNAVAILABLE');

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
      nextQuote = await this.gateway.applyBenefit(currentQuote, couponCode, customerId);
    } catch (error) {
      this.throwProviderError(error, 'BENEFITS_UNAVAILABLE');
    }
    this.assertValidQuote(nextQuote, 'BENEFITS_UNAVAILABLE');
    this.assertQuoteContext(nextQuote, currentQuote, 'BENEFITS_UNAVAILABLE');
    return this.withCustomerContextLock(customerId, async () => {
      if (this.quotes.get(customerId, input.quoteId) !== currentQuote) {
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
    sessionHash?: string,
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
      if (!await this.findOwnedCart(operation.cartId, customerId, sessionHash)) {
        throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });
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
    } else {
      const quote = this.quotes.get(customerId, input.quoteId);
      if (!quote) this.fail(409, 'QUOTE_EXPIRED');
      if (quote.cartVersion !== input.cartVersion) this.fail(409, 'CART_CHANGED');
      const cart = await this.findActiveCart(customerId, sessionHash);
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
        data: {
          state: CheckoutOperationState.FAILED,
          failureCode: 'QUOTE_EXPIRED',
          completedAt: this.completionTime(operation.createdAt),
        },
      });
      this.fail(409, 'QUOTE_EXPIRED');
    }
    const cart = await this.findOwnedCart(operation.cartId, customerId, sessionHash);
    if (!cart || cart.version !== context.cartVersion) {
      await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.FAILED,
          failureCode: 'REVALIDATION_CHANGED',
          completedAt: this.completionTime(operation.createdAt),
        },
      });
      this.fail(409, 'REVALIDATION_CHANGED');
    }
    if (operation.state === CheckoutOperationState.PREPARED) return this.operationView(operation);

    let revalidation: { available: boolean; revalidatedAt: string };
    try {
      revalidation = await this.gateway.revalidate(context.lines, customerId, context.quoteId);
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
          completedAt: this.completionTime(operation.createdAt),
        },
      });
      this.fail(409, 'STOCK_NOT_AVAILABLE');
    }

    const latestCart = await this.findOwnedCart(operation.cartId, customerId, sessionHash);
    if (!latestCart || latestCart.version !== context.cartVersion) {
      await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.FAILED,
          failureCode: 'REVALIDATION_CHANGED',
          completedAt: this.completionTime(operation.createdAt),
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
    input: { checkoutOperationId: string; contact: CheckoutContactDto; paymentMethod?: string; deliveryRecipient?: string },
    idempotencyKey: string | undefined,
    sessionHash?: string,
    accessToken?: string,
  ): Promise<ApiResult<CheckoutOperationView>> {
    const totalBudgetMs = orderTotalBudgetMs();
    const budgetDeadline = totalBudgetMs === undefined ? undefined : Date.now() + totalBudgetMs;
    this.assertIdempotencyKey(idempotencyKey, true);
    let operation = await this.prisma.checkoutOperation.findFirst({
      where: { id: input.checkoutOperationId, customerId },
    });
    if (!operation) throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });
    if (!await this.findOwnedCart(operation.cartId, customerId, sessionHash)) {
      throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });
    }
    const context = this.readPreparedContext(operation);
    let paymentMethod = input.paymentMethod;

    if (this.gateway.usesG5Sales?.()) {
      try {
        paymentMethod = this.gateway.g5OrderPaymentMethod?.(customerId, context?.quoteId, paymentMethod) ?? paymentMethod;
      } catch (error) {
        this.throwProviderError(error, 'SALES_UNAVAILABLE');
      }
      this.assertG5OrderContext(context, { ...input, paymentMethod });
    }

    const requestFingerprint = this.fingerprint({
      checkoutOperationId: operation.id,
      idempotencyKey,
      contact: input.contact,
      paymentMethod: paymentMethod ?? null,
      deliveryRecipient: input.deliveryRecipient ?? null,
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
            completedAt: this.completionTime(operation.createdAt),
          },
        });
        this.fail(409, 'QUOTE_EXPIRED');
      }
      const cart = await this.findOwnedCart(operation.cartId, customerId, sessionHash);
      if (!cart || cart.version !== context.cartVersion) {
        operation = await this.prisma.checkoutOperation.update({
          where: { id: operation.id },
          data: {
            state: CheckoutOperationState.FAILED,
            failureCode: 'CHECKOUT_CONTEXT_CHANGED',
            completedAt: this.completionTime(operation.createdAt),
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
      try {
        const order = await this.gateway.getOrder(operation.externalOrderId, accessToken);
        return {
          status: 200,
          data: {
            ...this.operationView(operation),
            orderId: order.pedidoId,
            orderState: order.estado,
            total: order.total,
            createdAt: order.createdAt,
          },
        };
      } catch (error) {
        this.throwProviderError(error, 'SALES_UNAVAILABLE');
      }
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
          quote: context!,
          paymentMethod,
          deliveryRecipient: input.deliveryRecipient,
          customerAccessToken: accessToken,
        });
      } catch (error) {
        this.throwProviderError(error, 'ORDER_CREATION_PENDING');
      }
      this.assertValidSalesOrder(createdOrder);
      // M1 has no lookup-by-idempotency endpoint. Persist the returned ID as soon
      // as the idempotent POST succeeds, so subsequent status reads use the
      // customer's token rather than trying an invented recovery route.
      operation = await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: { externalOrderId: createdOrder.pedidoId },
      });
    }

    const result = await this.refreshOrder(operation, accessToken, budgetDeadline);
    return result;
  }

  async getOperation(
    customerId: string,
    operationId: string,
    sessionHash?: string,
    accessToken?: string,
  ): Promise<ApiResult<CheckoutOperationStatusView>> {
    const operation = await this.prisma.checkoutOperation.findFirst({
      where: { id: operationId, customerId },
    });
    if (!operation) throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });
    if (!await this.findOwnedCart(operation.cartId, customerId, sessionHash)) {
      throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });
    }

    if (operation.state === CheckoutOperationState.PREPARED) {
      this.fail(409, 'ORDER_NOT_SUBMITTED');
    }
    if (operation.state === CheckoutOperationState.SUBMITTED) {
      const result = await this.refreshOrder(operation, accessToken);
      return {
        status: result.status,
        data: this.operationStatusView(result.data),
        ...(result.retryAfterSeconds !== undefined ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      };
    }
    if (operation.state === CheckoutOperationState.FAILED) {
      this.fail(409, operation.failureCode ?? 'ORDER_NOT_COMPLETED');
    }
    if (
      operation.externalOrderId && operation.state === CheckoutOperationState.SUCCEEDED
    ) {
      try {
        const order = await this.gateway.getOrder(operation.externalOrderId, accessToken);
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

  private async refreshOrder(operation: Prisma.CheckoutOperationGetPayload<object>, accessToken?: string, budgetDeadline?: number): Promise<ApiResult<CheckoutOperationView>> {
    if (!operation.externalOrderId && !operation.orderIdempotencyKey) {
      return {
        status: 202,
        data: { ...this.operationView(operation), recoveryRequired: true },
      };
    }

    let order: SalesOrder;
    try {
      order = operation.externalOrderId
        ? this.gateway.usesG5Sales?.()
          ? await this.pollG5Order(operation.externalOrderId, accessToken, budgetDeadline)
          : await this.gateway.getOrder(operation.externalOrderId, accessToken)
        : await this.gateway.getOrderByIdempotencyKey(operation.orderIdempotencyKey!, operation.customerId);
    } catch (error) {
      if (error instanceof ProviderError && error.status === 429) {
        return {
          status: 429,
          data: this.operationView(operation),
          ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        };
      }
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
          completedAt: this.completionTime(operation.createdAt),
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
          completedAt: this.completionTime(operation.createdAt),
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

  private async findActiveCart(customerId: string, sessionHash?: string) {
    let cart = sessionHash
      ? await (async () => {
          const customerCart = await this.prisma.cart.findFirst({
            where: { customerId, state: 'ACTIVE' },
            include: { items: true },
            orderBy: { updatedAt: 'desc' },
          });
          const sessionCart = await this.prisma.cart.findFirst({
            where: { anonymousSessionHash: sessionHash, state: 'ACTIVE' },
            include: { items: true },
          });
          if (customerCart && sessionCart && customerCart.id !== sessionCart.id) {
            this.fail(409, 'CART_OWNERSHIP_CONFLICT');
          }
          return customerCart ?? sessionCart;
        })()
      : await this.prisma.cart.findFirst({
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
          data: { customerId, anonymousSessionHash: null },
          include: { items: true },
        });
      }
    }

    return cart;
  }

  private async findOwnedCart(cartId: string, customerId: string, sessionHash?: string) {
    return this.prisma.cart.findFirst({
      where: {
        id: cartId,
        state: 'ACTIVE',
        ...(sessionHash
          ? { OR: [{ customerId }, { anonymousSessionHash: sessionHash }] }
          : { customerId }),
      },
    });
  }

  private createPreparedContext(quote: CheckoutQuote, cartVersion: number): PreparedContext {
    return {
      quoteId: quote.quoteId,
      cartVersion,
      addressId: quote.addressId,
      expiresAt: Date.parse(quote.expiresAt),
      total: quote.total,
      lines: quote.lines,
      quoteSnapshot: {
        subtotal: quote.subtotal,
        discount: quote.discount,
        shipping: quote.shipping,
        ...(quote.selectedBenefit ? { selectedBenefit: quote.selectedBenefit } : {}),
      },
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
      preparedQuoteSnapshot: context.quoteSnapshot as unknown as Prisma.InputJsonValue,
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
    preparedQuoteSnapshot?: Prisma.JsonValue | null;
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
        Number.isInteger(line.quantity) && line.quantity > 0 &&
        (!('productId' in line) || typeof line.productId === 'string') &&
        (!('description' in line) || typeof line.description === 'string') &&
        (!('unitPrice' in line) || (typeof line.unitPrice === 'object' && line.unitPrice !== null &&
          'amount' in line.unitPrice && typeof line.unitPrice.amount === 'number' && Number.isFinite(line.unitPrice.amount) &&
          'currency' in line.unitPrice && line.unitPrice.currency === 'PEN')))
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
      lines: lines.map((line) => {
        const value = line as Record<string, unknown>;
        return {
          sku: value.sku as string,
          quantity: value.quantity as number,
          ...(typeof value.productId === 'string' ? { productId: value.productId } : {}),
          ...(typeof value.description === 'string' ? { description: value.description } : {}),
          ...(typeof value.unitPrice === 'object' && value.unitPrice !== null
            ? { unitPrice: value.unitPrice as unknown as Money } : {}),
        };
      }),
      ...this.readQuoteSnapshot(operation.preparedQuoteSnapshot),
      ...(operation.revalidatedAt ? { revalidatedAt: operation.revalidatedAt.toISOString() } : {}),
    };
  }

  private async pollG5Order(orderId: string, accessToken?: string, budgetDeadline?: number): Promise<SalesOrder> {
    const deadline = Math.min(Date.now() + orderPollMaxMs(), budgetDeadline ?? Number.POSITIVE_INFINITY);
    let lastOrder: SalesOrder | undefined;
    while (Date.now() < deadline) {
      try {
        lastOrder = await this.gateway.getOrder(orderId, accessToken, deadline - Date.now());
        if (Date.now() > deadline) throw new ProviderError(504, 'SALES_STATUS_TIMEOUT');
      } catch (error) {
        if (!(error instanceof ProviderError) || error.status !== 429) throw error;
        const remaining = deadline - Date.now();
        const retryMs = error.retryAfterSeconds === undefined
          ? G5_POLL_INTERVAL_MS : Math.max(G5_POLL_INTERVAL_MS, error.retryAfterSeconds * 1000);
        if (retryMs > remaining) throw error;
        await wait(retryMs);
        continue;
      }
      if (lastOrder.estado === 'PAGADO' || lastOrder.estado === 'ANULADO') return lastOrder;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await wait(Math.min(G5_POLL_INTERVAL_MS, remaining));
    }
    if (!lastOrder) throw new ProviderError(503, 'SALES_UNAVAILABLE');
    return lastOrder;
  }

  private readQuoteSnapshot(value: Prisma.JsonValue | null | undefined): Pick<PreparedContext, 'quoteSnapshot'> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const snapshot = value as Record<string, unknown>;
    const money = (candidate: unknown): candidate is Money => typeof candidate === 'object' && candidate !== null &&
      'amount' in candidate && typeof candidate.amount === 'number' && Number.isFinite(candidate.amount) && candidate.amount >= 0 &&
      'currency' in candidate && candidate.currency === 'PEN';
    const shipping = snapshot.shipping;
    if (!money(snapshot.subtotal) || !money(snapshot.discount) || typeof shipping !== 'object' || shipping === null ||
        !('amount' in shipping) || typeof shipping.amount !== 'number' || !Number.isFinite(shipping.amount) || shipping.amount < 0 ||
        !('currency' in shipping) || shipping.currency !== 'PEN' ||
        !('estimatedDays' in shipping) || typeof shipping.estimatedDays !== 'number' ||
        !Number.isFinite(shipping.estimatedDays) || shipping.estimatedDays < 0) {
      return {};
    }
    const selectedBenefit = snapshot.selectedBenefit;
    if (selectedBenefit !== undefined && selectedBenefit !== null &&
        (typeof selectedBenefit !== 'object' || Array.isArray(selectedBenefit) ||
          !('type' in selectedBenefit) || selectedBenefit.type !== 'COUPON' ||
          !('id' in selectedBenefit) || typeof selectedBenefit.id !== 'string' ||
          !('discount' in selectedBenefit) || !money(selectedBenefit.discount))) return {};
    if (selectedBenefit && 'code' in selectedBenefit && typeof selectedBenefit.code !== 'string') return {};
    return {
      quoteSnapshot: {
        subtotal: snapshot.subtotal,
        discount: snapshot.discount,
        shipping: shipping as CheckoutQuote['shipping'],
        ...(selectedBenefit ? { selectedBenefit: selectedBenefit as CheckoutQuote['selectedBenefit'] } : {}),
      },
    };
  }

  private assertG5OrderContext(
    context: PreparedContext | null,
    input: { contact: CheckoutContactDto; paymentMethod?: string },
  ): void {
    const fallbackEnabled = this.gateway.usesG5ContractProductFallback?.() ?? false;
    const hasContractFallback = fallbackEnabled && context?.lines.length === 1 &&
      context.lines[0].sku === 'SKU-AUR-01' && context.lines[0].quantity === 1 &&
      context.quoteSnapshot?.subtotal.amount === 129.9;
    const hasCatalogSnapshot = Boolean(context?.lines.length && context.lines.every((line) =>
      typeof line.productId === 'string' && line.productId.trim() && line.unitPrice?.currency === 'PEN' &&
      Number.isFinite(line.unitPrice.amount) && line.unitPrice.amount >= 0));
    const snapshot = context?.quoteSnapshot;
    const itemSubtotalCents = context?.lines.reduce((sum, line) =>
      sum + Math.round((line.unitPrice?.amount ?? 0) * line.quantity * 100), 0);
    const expectedTotalCents = snapshot
      ? Math.round((snapshot.subtotal.amount - snapshot.discount.amount + snapshot.shipping.amount) * 100)
      : -1;
    const financialsConsistent = Boolean(context && snapshot &&
      (!hasCatalogSnapshot || itemSubtotalCents === Math.round(snapshot.subtotal.amount * 100)) &&
      Math.round(context.total.amount * 100) === expectedTotalCents &&
      context.total.currency === snapshot.subtotal.currency && snapshot.subtotal.currency === snapshot.shipping.currency &&
      (snapshot.discount.amount === 0 || (snapshot.selectedBenefit?.code?.trim() &&
        snapshot.selectedBenefit.discount.amount === snapshot.discount.amount &&
        snapshot.selectedBenefit.discount.currency === snapshot.discount.currency)));
    if (!context || !snapshot || (!hasCatalogSnapshot && !hasContractFallback) || !financialsConsistent ||
        !input.paymentMethod?.trim()) {
      this.fail(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
    }
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

  private assertQuoteContext(
    quote: CheckoutQuote,
    expected: Pick<CheckoutQuote, 'addressId' | 'cartVersion' | 'lines'>,
    errorCode: string,
  ): void {
    const normalizeLines = (lines: QuoteLine[]) => lines
      .map((line) => [line.sku, line.quantity] as const)
      .sort(([leftSku, leftQuantity], [rightSku, rightQuantity]) =>
        leftSku.localeCompare(rightSku) || leftQuantity - rightQuantity);

    if (
      quote.addressId !== expected.addressId ||
      quote.cartVersion !== expected.cartVersion ||
      JSON.stringify(normalizeLines(quote.lines)) !== JSON.stringify(normalizeLines(expected.lines))
    ) {
      this.fail(503, errorCode);
    }
  }

  private assertValidSalesOrder(order: SalesOrder): void {
    if (
      !order ||
      typeof order.pedidoId !== 'string' || !SALES_ORDER_ID.test(order.pedidoId) ||
      !['CREADO', 'PAGADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO', 'ANULADO'].includes(order.estado) ||
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
        completedAt: this.completionTime(),
      },
    });
  }

  private completionTime(createdAt?: Date): Date {
    // PostgreSQL stores microseconds while JavaScript Date stores milliseconds.
    // Advancing one millisecond prevents a freshly-created row from receiving a
    // completed_at value that rounds below its persisted created_at value.
    return new Date(Math.max(Date.now() + 1, (createdAt?.getTime() ?? 0) + 1));
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
    if (error.status === 429) {
      this.fail(429, 'SALES_RATE_LIMITED', error.retryAfterSeconds === undefined ? {} : {
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    if (fallbackCode === 'ADDRESS_SERVICE_UNAVAILABLE') {
      if (error.status === 400) this.fail(400, 'ADDRESS_VALIDATION_ERROR');
      if (error.status === 401) this.fail(401, 'UNAUTHENTICATED');
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
      SALES_AUTH_UNAVAILABLE: { status: 503, code: 'SALES_UNAVAILABLE' },
      SALES_AUTHENTICATION_FAILED: { status: 401, code: 'UNAUTHENTICATED' },
      SALES_ACCESS_DENIED: { status: 403, code: 'ORDERS_ACCESS_DENIED' },
      SALES_ORDER_NOT_FOUND: { status: 404, code: 'ORDER_NOT_FOUND' },
      SALES_ORDER_CONTEXT_INCOMPLETE: { status: 409, code: 'SALES_ORDER_CONTEXT_INCOMPLETE' },
      SALES_ADDRESS_UNAVAILABLE: { status: 409, code: 'SALES_ADDRESS_UNAVAILABLE' },
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

  private fail(status: number, code: string, details: Record<string, unknown> = {}): never {
    throw new HttpException({ error: { code, ...details } }, status);
  }
}
