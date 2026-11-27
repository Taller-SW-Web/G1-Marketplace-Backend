import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { createHash, randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import {
  CheckoutContact,
  CheckoutQuote,
  DeliveryAddress,
  Money,
  QuoteLine,
  SalesOrder,
} from '../checkout.types';
import { CreateDeliveryAddressDto } from '../dto/delivery-address.dto';
import { record } from '../../auth/g7.client';
import { G5CheckoutFixture, G5_FIXTURE_ENV, parseG5CheckoutFixture } from '../../config/checkout-g5-fixture';
import { ProviderError } from './provider-error';
import { G5SalesProvider, G5CreateOrderRequest } from './g5-sales.provider';

const PRISM_ADDRESS_BASE = 'http://localhost:4010';
const FIXTURE_ADDRESS_BASE = 'http://security.mock';
const G5_FIXTURE_QUOTE_PREFIX = 'Q-G5-MOCK-';

interface Envelope<T> {
  data: T;
}

@Injectable()
export class MarketplaceGateway {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @Optional() private readonly g5Sales?: G5SalesProvider,
  ) {}

  usesG5Sales(): boolean {
    return this.config.get<string>('CHECKOUT_SALES_SOURCE', 'mock') === 'g5';
  }

  usesG5ContractProductFallback(): boolean {
    return this.config.get<string>('G5_CONTRACT_PRODUCT_FALLBACK_ENABLED', 'false') === 'true';
  }

  async listAddresses(owner: string, accessToken: string): Promise<DeliveryAddress[]> {
    const result = await this.requestAddresses(owner, accessToken);
    if (!record(result) || !Array.isArray(result.direcciones)) {
      throw new ProviderError(503, 'ADDRESS_SERVICE_UNAVAILABLE');
    }
    return result.direcciones.map((address: unknown) => this.mapAddress(address));
  }

  async createAddress(owner: string, accessToken: string, address: CreateDeliveryAddressDto): Promise<DeliveryAddress> {
    const result = await this.requestAddresses(owner, accessToken, {
      id: randomUUID(),
      etiqueta: address.label ?? undefined,
      direccion: address.street,
      distrito: address.district,
      provincia: address.province,
      departamento: address.department,
      referencia: address.reference ?? undefined,
    });
    return this.mapAddress(result);
  }

  private mapAddress(value: unknown): DeliveryAddress {
    if (!record(value) || typeof value.id !== 'string' || !value.id.trim()
      || typeof value.direccion !== 'string' || !value.direccion.trim()
      || typeof value.distrito !== 'string' || !value.distrito.trim()
      || typeof value.provincia !== 'string' || !value.provincia.trim()
      || typeof value.departamento !== 'string' || !value.departamento.trim()) {
      throw new ProviderError(503, 'ADDRESS_SERVICE_UNAVAILABLE');
    }
    return {
      addressId: value.id,
      street: value.direccion,
      district: value.distrito,
      province: value.provincia,
      department: value.departamento,
      ...(typeof value.etiqueta === 'string' ? { label: value.etiqueta } : {}),
      ...(typeof value.referencia === 'string' ? { reference: value.referencia } : {}),
    };
  }

  private async requestAddresses(owner: string, accessToken: string, body?: unknown): Promise<unknown> {
    const source = this.config.get<string>('CHECKOUT_ADDRESS_SOURCE', 'fixture');
    const mocks = this.config.get<boolean>('USE_MOCKS', false);
    const production = this.config.get<string>('NODE_ENV') === 'production';
    let base: string;
    if (source === 'g7' && this.config.get<string>('AUTH_ENABLED') === 'true' && !mocks) {
      base = this.config.getOrThrow<string>('G7_API_URL').replace(/\/$/, '');
    } else if (!production && mocks && source === 'prism') {
      base = PRISM_ADDRESS_BASE;
    } else if (!production && mocks && source === 'fixture') {
      base = FIXTURE_ADDRESS_BASE;
    } else {
      throw new ProviderError(503, 'ADDRESS_SERVICE_UNAVAILABLE');
    }
    const headers = { Authorization: `Bearer ${accessToken}` };
    const url = `${base}/usuarios/${encodeURIComponent(owner)}/direcciones`;
    try {
      const options = { headers, maxRedirects: 0, proxy: false as const };
      const response = await firstValueFrom(body === undefined
        ? this.http.get<unknown>(url, options)
        : this.http.post<unknown>(url, body, options));
      if (response.status !== (body === undefined ? 200 : 201)) {
        throw new ProviderError(503, 'ADDRESS_SERVICE_UNAVAILABLE');
      }
      return response.data;
    } catch (error) {
      const status = (error as AxiosError).response?.status ?? 503;
      throw new ProviderError(status, 'ADDRESS_SERVICE_UNAVAILABLE');
    }
  }

  async createQuote(input: {
    address: DeliveryAddress;
    addressId: string;
    cartVersion: number;
    lines: QuoteLine[];
  }, customerId?: string): Promise<CheckoutQuote> {
    const fixture = this.checkoutFixture(customerId);
    if (fixture) {
      this.assertFixtureLines(input.lines, fixture);
      const money = (cents: number): Money => ({ amount: cents / 100, currency: 'PEN' });
      return {
        quoteId: `${this.fixtureQuotePrefix(fixture)}${randomUUID()}`,
        expiresAt: new Date(Math.min(Date.now() + 300_000, Date.parse(fixture.expiresAt))).toISOString(),
        subtotal: money(fixture.unitPriceCents), discount: money(0),
        shipping: { ...money(fixture.shippingCents), estimatedDays: 2 },
        total: money(fixture.unitPriceCents + fixture.shippingCents),
        lines: [{ sku: fixture.sku, quantity: 1, productId: fixture.productId, unitPrice: money(fixture.unitPriceCents) }],
        addressId: input.addressId, cartVersion: input.cartVersion,
      };
    }
    return this.request('post', 'http://catalog.mock/checkout-quotes', input);
  }

  async applyBenefit(quote: CheckoutQuote, couponCode?: string, customerId?: string): Promise<CheckoutQuote> {
    const fixture = this.checkoutFixture(customerId);
    if (fixture || quote.quoteId.startsWith(G5_FIXTURE_QUOTE_PREFIX)) {
      this.g5OrderPaymentMethod(customerId, quote.quoteId);
      if (couponCode) throw new ProviderError(422, 'COUPON_NOT_APPLICABLE');
      return quote;
    }
    return this.request('post', 'http://benefits.mock/apply', { quote, couponCode });
  }

  async revalidate(lines: QuoteLine[], customerId?: string, quoteId?: string): Promise<{ available: boolean; revalidatedAt: string }> {
    const fixture = this.checkoutFixture(customerId);
    if (fixture || quoteId?.startsWith(G5_FIXTURE_QUOTE_PREFIX)) {
      this.g5OrderPaymentMethod(customerId, quoteId);
      if (!fixture) throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
      this.assertFixtureLines(lines, fixture);
      return { available: true, revalidatedAt: new Date().toISOString() };
    }
    return this.request('post', 'http://inventory.mock/revalidate', { lines });
  }

  g5OrderPaymentMethod(customerId?: string, quoteId?: string, requested?: string): string | undefined {
    const fixture = this.checkoutFixture(customerId);
    if (!fixture) {
      if (quoteId?.startsWith(G5_FIXTURE_QUOTE_PREFIX)) throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
      return requested;
    }
    if (!quoteId?.startsWith(this.fixtureQuotePrefix(fixture)) || (requested !== undefined && requested !== fixture.paymentMethod)) {
      throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
    }
    return fixture.paymentMethod;
  }

  private checkoutFixture(customerId?: string): G5CheckoutFixture | undefined {
    if (!this.usesG5Sales()) return undefined;
    const fixture = parseG5CheckoutFixture(this.config.get(G5_FIXTURE_ENV));
    if (fixture && (customerId !== fixture.customerId || Date.now() >= Date.parse(fixture.expiresAt))) {
      throw new ProviderError(403, 'CHECKOUT_TEST_FIXTURE_UNAVAILABLE');
    }
    return fixture;
  }

  private fixtureQuotePrefix(fixture: G5CheckoutFixture): string {
    const revision = createHash('sha256').update(JSON.stringify(fixture)).digest('hex').slice(0, 16);
    return `${G5_FIXTURE_QUOTE_PREFIX}${revision}-`;
  }

  private assertFixtureLines(lines: QuoteLine[], fixture: G5CheckoutFixture): void {
    if (lines.length !== 1 || lines[0].sku !== fixture.sku || lines[0].quantity !== 1) {
      throw new ProviderError(409, 'LINE_NOT_AVAILABLE');
    }
  }

  createOrder(input: {
    customerId: string;
    checkoutOperationId: string;
    idempotencyKey: string;
    contact: CheckoutContact;
    total: Money;
    quote?: {
      quoteId?: string;
      addressId: string;
      lines: QuoteLine[];
      quoteSnapshot?: {
        subtotal: Money;
        discount: Money;
        shipping: Money & { estimatedDays: number };
        selectedBenefit?: CheckoutQuote['selectedBenefit'];
      };
    };
      paymentMethod?: string;
      deliveryRecipient?: string;
      customerAccessToken?: string;
      /** Límite (ms epoch) del presupuesto total de la creación; solo lo usa Ventas (G5). */
      deadlineAt?: number;
  }): Promise<SalesOrder> {
    if (this.usesG5Sales()) return this.createG5Order(input);
    const { customerId, checkoutOperationId, idempotencyKey, contact, total } = input;
    const body = { checkoutOperationId, contact, total };
    return this.request('post', 'http://sales.mock/orders', body, {
      'Idempotency-Key': idempotencyKey,
      'X-Mock-Idempotency-Scope': this.mockIdempotencyScope(customerId),
    });
  }

  getOrder(orderId: string, customerAccessToken?: string, remainingMs?: number): Promise<SalesOrder> {
    if (this.usesG5Sales()) {
      if (!this.g5Sales || !customerAccessToken) throw new ProviderError(503, 'SALES_INTEGRATION_DISABLED');
      return this.g5Sales.getOrder(orderId, customerAccessToken, remainingMs);
    }
    return this.request('get', `http://sales.mock/orders/${encodeURIComponent(orderId)}`);
  }

  getOrderByIdempotencyKey(idempotencyKey: string, customerId: string): Promise<SalesOrder> {
    if (this.usesG5Sales()) throw new ProviderError(501, 'SALES_IDEMPOTENCY_LOOKUP_UNSUPPORTED');
    return this.request(
      'get',
      `http://sales.mock/orders/by-idempotency-key/${encodeURIComponent(idempotencyKey)}`,
      undefined,
      { 'X-Mock-Idempotency-Scope': this.mockIdempotencyScope(customerId) },
    );
  }

  private async createG5Order(input: {
    customerId: string;
    idempotencyKey: string;
    contact: CheckoutContact;
    quote?: {
      quoteId?: string;
      addressId: string;
      lines: QuoteLine[];
      quoteSnapshot?: {
        subtotal: Money;
        discount: Money;
        shipping: Money & { estimatedDays: number };
        selectedBenefit?: CheckoutQuote['selectedBenefit'];
      };
    };
    paymentMethod?: string;
    deliveryRecipient?: string;
    customerAccessToken?: string;
    deadlineAt?: number;
    total: Money;
  }): Promise<SalesOrder> {
    if (!this.g5Sales || !input.customerAccessToken) throw new ProviderError(503, 'SALES_INTEGRATION_DISABLED');
    const quote = input.quote;
    const snapshot = quote?.quoteSnapshot;
    const paymentMethod = this.g5OrderPaymentMethod(input.customerId, quote?.quoteId, input.paymentMethod);
    if (!quote || !snapshot || !paymentMethod?.trim()) {
      throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
    }
    const fixture = this.checkoutFixture(input.customerId);
    if (fixture) {
      this.assertFixtureLines(quote.lines, fixture);
      if (quote.lines[0].productId !== fixture.productId || quote.lines[0].unitPrice?.amount !== fixture.unitPriceCents / 100 ||
          snapshot.shipping.amount !== fixture.shippingCents / 100 || snapshot.discount.amount !== 0 || snapshot.selectedBenefit) {
        throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
      }
    }

    let addresses: DeliveryAddress[];
    try {
      addresses = await this.listAddresses(input.customerId, input.customerAccessToken);
    } catch {
      throw new ProviderError(503, 'SALES_ADDRESS_UNAVAILABLE');
    }
    const address = addresses.find((candidate) => candidate.addressId === quote.addressId);
    if (!address) throw new ProviderError(409, 'SALES_ADDRESS_UNAVAILABLE');
    // Do not begin a new outbound order if the window elapsed during the address lookup.
    if (fixture) this.checkoutFixture(input.customerId);
    const items = this.g5Items(quote.lines, snapshot.subtotal.amount);
    const discountAmount = snapshot.discount.amount;
    const benefit = snapshot.selectedBenefit;
    if (discountAmount > 0 && !benefit?.code?.trim()) {
      throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
    }
    const request: G5CreateOrderRequest = {
      canal: 'MARKETPLACE',
      contacto: {
        clienteId: input.customerId,
        nombreCompleto: input.contact.fullName,
        tipoDocumento: input.contact.documentType,
        numeroDocumento: input.contact.documentNumber,
        ...(input.contact.phone ? { telefono: input.contact.phone } : {}),
        ...(input.contact.email ? { email: input.contact.email } : {}),
      },
      items,
      ...(benefit?.code ? { cupon: { codigo: benefit.code, descuento: discountAmount, aplicado: true } } : {}),
      envio: {
        modalidad: 'DOMICILIO',
        costo: snapshot.shipping.amount,
        destinatario: input.deliveryRecipient?.trim() || input.contact.fullName,
        departamento: address.department,
        provincia: address.province,
        distrito: address.district,
        direccion: address.street,
        ...(address.reference ? { referencia: address.reference } : {}),
      },
      pago: {
        metodoPago: paymentMethod,
        moneda: snapshot.subtotal.currency as 'PEN' | 'USD',
        subtotal: snapshot.subtotal.amount,
        descuentoCupon: discountAmount,
        costoEnvio: snapshot.shipping.amount,
        total: input.total.amount,
      },
    };
    if (snapshot.subtotal.currency !== snapshot.shipping.currency || snapshot.subtotal.currency !== input.total.currency ||
        Math.round(request.pago.total * 100) !== Math.round((snapshot.subtotal.amount - discountAmount + snapshot.shipping.amount) * 100)) {
      throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
    }
    return input.deadlineAt === undefined
      ? this.g5Sales.createOrder(request, input.idempotencyKey)
      : this.g5Sales.createOrder(request, input.idempotencyKey, input.deadlineAt);
  }

  private g5Items(lines: QuoteLine[], quoteSubtotal: number): G5CreateOrderRequest['items'] {
    const fallback = this.usesG5ContractProductFallback() && lines.length === 1 &&
      lines[0].sku === 'SKU-AUR-01' && lines[0].quantity === 1 && quoteSubtotal === 129.9;
    const items = lines.map((line) => {
      if (line.productId && line.unitPrice && line.unitPrice.currency === 'PEN' &&
          Number.isFinite(line.unitPrice.amount) && line.unitPrice.amount >= 0) {
        return {
          productoId: line.productId,
          sku: line.sku,
          cantidad: line.quantity,
          precioUnitario: line.unitPrice.amount,
          ...(line.description ? { descripcion: line.description } : {}),
        };
      }
      if (fallback) return {
        productoId: 'PROD-101',
        sku: 'SKU-AUR-01',
        cantidad: 1,
        precioUnitario: 129.9,
        descripcion: 'Audífonos Inalámbricos Bluetooth',
      };
      throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
    });
    const subtotalCents = items.reduce((sum, item) => sum + Math.round(item.precioUnitario * item.cantidad * 100), 0);
    if (subtotalCents !== Math.round(quoteSubtotal * 100)) throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
    return items;
  }

  private mockIdempotencyScope(customerId: string): string {
    return createHash('sha256').update(customerId).digest('hex');
  }

  private async request<T>(
    method: 'get' | 'post',
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    if (!this.config.get<boolean>('USE_MOCKS', false)) {
      throw new ServiceUnavailableException({
        error: { code: 'EXTERNAL_INTEGRATION_DISABLED' },
      });
    }

    try {
      const response =
        method === 'get'
          ? await firstValueFrom(this.http.get<Envelope<T>>(url, { headers }))
          : await firstValueFrom(this.http.post<Envelope<T>>(url, body, { headers }));
      return response.data.data;
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: { code?: string } }>;
      const status = axiosError.response?.status ?? 503;
      const code = axiosError.response?.data?.error?.code ?? 'PROVIDER_UNAVAILABLE';
      throw new ProviderError(status, code);
    }
  }
}
