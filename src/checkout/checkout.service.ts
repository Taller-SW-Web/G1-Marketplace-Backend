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
  CheckoutQuote,
  DeliveryAddress,
  SalesOrder,
} from './checkout.types';
import { MarketplaceGateway } from './external/marketplace.gateway';
import { ProviderError } from './external/provider-error';
import { QuotesService } from './quotes.service';

const IDEMPOTENCY_UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ApiResult<T> {
  status: number;
  data: T;
}

interface PreparedContext {
  cartVersion: number;
  addressId: string;
  expiresAt: number;
  total: CheckoutQuote['total'];
}

@Injectable()
export class CheckoutService {
  private readonly preparedContexts = new Map<string, PreparedContext>();

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
      this.quotes.invalidate(customerId);
      await this.invalidatePreparedOperations(customerId);
      return address;
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

    await this.invalidatePreparedOperations(customerId);
    return this.quotes.replace(customerId, quote);
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
    await this.invalidatePreparedOperations(customerId);
    return this.quotes.replace(customerId, nextQuote);
  }

  async prepare(
    customerId: string,
    input: PrepareCheckoutDto,
    idempotencyKey: string | undefined,
  ): Promise<CheckoutOperationView> {
    this.assertIdempotencyKey(idempotencyKey);
    if (!input.simulationConfirmed) this.fail(400, 'SIMULATION_NOT_CONFIRMED');
    const quote = this.quotes.get(customerId, input.quoteId);
    if (!quote) this.fail(409, 'QUOTE_EXPIRED');
    if (quote.cartVersion !== input.cartVersion) this.fail(409, 'CART_CHANGED');

    const cart = await this.findActiveCart(customerId);
    if (!cart) this.fail(409, 'CART_NOT_FOUND');
    if (cart.version !== input.cartVersion) this.fail(409, 'CART_CHANGED');
    const fingerprint = this.fingerprint({
      quoteId: input.quoteId,
      cartId: cart.id,
      cartVersion: cart.version,
      addressId: quote.addressId,
      simulationConfirmed: input.simulationConfirmed,
    });

    let operation = await this.prisma.checkoutOperation.findUnique({
      where: {
        customerId_idempotencyKey: { customerId, idempotencyKey: idempotencyKey! },
      },
    });
    if (operation) {
      if (
        (operation.state === CheckoutOperationState.PREPARING ||
          operation.state === CheckoutOperationState.PREPARED) &&
        operation.requestFingerprint !== fingerprint
      ) this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
      if (operation.state === CheckoutOperationState.FAILED) {
        this.fail(409, operation.failureCode ?? 'PREPARATION_FAILED');
      }
      if (operation.state !== CheckoutOperationState.PREPARING) {
        if (operation.state === CheckoutOperationState.PREPARED) {
          this.rememberPreparedContext(operation.id, cart.version, quote);
        }
        return this.operationView(operation);
      }
    } else {
      try {
        operation = await this.prisma.checkoutOperation.create({
          data: {
            customerId,
            cartId: cart.id,
            idempotencyKey: idempotencyKey!,
            requestFingerprint: fingerprint,
            state: CheckoutOperationState.PREPARING,
          },
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        operation = await this.prisma.checkoutOperation.findUnique({
          where: {
            customerId_idempotencyKey: { customerId, idempotencyKey: idempotencyKey! },
          },
        });
        if (
          !operation ||
          ((operation.state === CheckoutOperationState.PREPARING ||
            operation.state === CheckoutOperationState.PREPARED) &&
            operation.requestFingerprint !== fingerprint)
        ) {
          this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
        }
        if (operation.state === CheckoutOperationState.FAILED) {
          this.fail(409, operation.failureCode ?? 'PREPARATION_FAILED');
        }
        if (operation.state !== CheckoutOperationState.PREPARING) {
          if (operation.state === CheckoutOperationState.PREPARED) {
            this.rememberPreparedContext(operation.id, cart.version, quote);
          }
          return this.operationView(operation);
        }
      }
    }

    let revalidation: { available: boolean; revalidatedAt: string };
    try {
      revalidation = await this.gateway.revalidate(quote.lines);
    } catch (error) {
      await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.FAILED,
          failureCode: 'REVALIDATION_UNAVAILABLE',
          completedAt: new Date(),
        },
      });
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
      where: { id: cart.id, customerId, state: 'ACTIVE' },
    });
    if (!latestCart || latestCart.version !== input.cartVersion) {
      await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.FAILED,
          failureCode: 'CART_CHANGED',
          completedAt: new Date(),
        },
      });
      this.fail(409, 'CART_CHANGED');
    }

    operation = await this.prisma.checkoutOperation.update({
      where: { id: operation.id },
      data: { state: CheckoutOperationState.PREPARED },
    });
    this.rememberPreparedContext(operation.id, cart.version, quote);
    return this.operationView(operation, revalidation.revalidatedAt);
  }

  async createOrder(
    customerId: string,
    input: { checkoutOperationId: string; contact: CheckoutContactDto },
    idempotencyKey: string | undefined,
  ): Promise<ApiResult<CheckoutOperationView>> {
    this.assertIdempotencyKey(idempotencyKey);
    let operation = await this.prisma.checkoutOperation.findFirst({
      where: { id: input.checkoutOperationId, customerId },
    });
    if (!operation) throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });

    const requestFingerprint = this.fingerprint({
      checkoutOperationId: operation.id,
      idempotencyKey,
      contact: input.contact,
    });
    if (operation.state === CheckoutOperationState.PREPARED) {
      const context = this.preparedContexts.get(operation.id);
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
      return { status: 200, data: this.operationView(operation) };
    }
    if (operation.state === CheckoutOperationState.SUCCEEDED) {
      return { status: 200, data: this.operationView(operation) };
    }
    if (
      operation.state === CheckoutOperationState.SUBMITTED &&
      operation.requestFingerprint !== requestFingerprint
    ) {
      this.fail(409, 'IDEMPOTENCY_KEY_REUSED');
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
      !this.preparedContexts.has(operation.id)
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
          checkoutOperationId: operation.id,
          // Operation UUID is stable across retries and serves as Sales idempotency key.
          idempotencyKey: operation.id,
          contact: input.contact,
          total: this.preparedContexts.get(operation.id)!.total,
        });
      } catch (error) {
        this.throwProviderError(error, 'ORDER_CREATION_PENDING');
      }
      operation = await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: { externalOrderId: createdOrder.pedidoId },
      });
    }

    const result = await this.refreshOrder(operation);
    return result;
  }

  async getOperation(
    customerId: string,
    operationId: string,
  ): Promise<ApiResult<CheckoutOperationView>> {
    const operation = await this.prisma.checkoutOperation.findFirst({
      where: { id: operationId, customerId },
    });
    if (!operation) throw new NotFoundException({ error: { code: 'OPERATION_NOT_FOUND' } });

    if (operation.state === CheckoutOperationState.PREPARED) {
      this.fail(409, 'ORDER_NOT_SUBMITTED');
    }
    if (operation.state === CheckoutOperationState.SUBMITTED && operation.externalOrderId) {
      return this.refreshOrder(operation);
    }
    if (operation.state === CheckoutOperationState.SUBMITTED) {
      return {
        status: 202,
        data: { ...this.operationView(operation), recoveryRequired: true },
      };
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
          data: {
            ...this.operationView(operation),
            orderId: order.pedidoId,
            orderState: order.estado,
            total: order.total,
            createdAt: order.createdAt,
          },
        };
      } catch {
        // Final operation state was persisted only after an authoritative Sales response.
      }
    }
    return { status: 200, data: this.operationView(operation) };
  }

  private async refreshOrder(operation: Prisma.CheckoutOperationGetPayload<object>): Promise<ApiResult<CheckoutOperationView>> {
    if (!operation.externalOrderId) {
      return {
        status: 202,
        data: { ...this.operationView(operation), recoveryRequired: true },
      };
    }

    let order: SalesOrder;
    try {
      order = await this.gateway.getOrder(operation.externalOrderId);
    } catch {
      // The provider may be temporarily unreachable; never infer PAGADO from a timeout.
      return {
        status: 202,
        data: {
          ...this.operationView(operation),
          orderId: operation.externalOrderId,
          orderState: 'CREADO',
        },
      };
    }

    if (order.estado === 'PAGADO') {
      const updated = await this.prisma.checkoutOperation.update({
        where: { id: operation.id },
        data: {
          state: CheckoutOperationState.SUCCEEDED,
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
    return this.prisma.cart.findFirst({
      where: { customerId, state: 'ACTIVE' },
      include: { items: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private rememberPreparedContext(
    operationId: string,
    cartVersion: number,
    quote: CheckoutQuote,
  ): void {
    this.preparedContexts.set(operationId, {
      cartVersion,
      addressId: quote.addressId,
      expiresAt: Date.parse(quote.expiresAt),
      total: quote.total,
    });
  }

  private assertValidQuote(quote: CheckoutQuote, code: string): void {
    const expiresAt = Date.parse(quote.expiresAt);
    if (
      !quote.quoteId ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      !Number.isFinite(quote.total?.amount) ||
      !Number.isFinite(quote.subtotal?.amount) ||
      !Number.isFinite(quote.shipping?.amount) ||
      !Array.isArray(quote.lines)
    ) {
      this.fail(503, code);
    }
  }

  private async invalidatePreparedOperations(customerId: string): Promise<void> {
    await this.prisma.checkoutOperation.updateMany({
      where: { customerId, state: CheckoutOperationState.PREPARED },
      data: {
        state: CheckoutOperationState.FAILED,
        failureCode: 'CHECKOUT_CONTEXT_CHANGED',
        completedAt: new Date(),
      },
    });
  }

  private assertIdempotencyKey(value: string | undefined): asserts value is string {
    if (!value || !IDEMPOTENCY_UUID_V4.test(value)) {
      this.fail(400, 'IDEMPOTENCY_KEY_REQUIRED');
    }
  }

  private operationView(operation: {
    id: string;
    state: CheckoutOperationState;
    externalOrderId: string | null;
    failureCode: string | null;
  }, revalidatedAt?: string): CheckoutOperationView & { simulationConsent?: string; revalidatedAt?: string } {
    const state =
      operation.state === CheckoutOperationState.PREPARING ? 'PREPARED' : operation.state;
    return {
      checkoutOperationId: operation.id,
      state: state as CheckoutOperationView['state'],
      ...(operation.externalOrderId ? { orderId: operation.externalOrderId } : {}),
      ...(operation.failureCode ? { failureCode: operation.failureCode } : {}),
      ...(operation.state === CheckoutOperationState.PREPARED
        ? { simulationConsent: 'RECORDED', ...(revalidatedAt ? { revalidatedAt } : {}) }
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
      throw new ServiceUnavailableException({ error: { code: fallbackCode } });
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
      SALES_TIMEOUT: { status: 503, code: 'ORDER_CREATION_PENDING' },
      SALES_STATUS_TIMEOUT: { status: 503, code: 'SALES_UNAVAILABLE' },
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
