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
import { ProviderError } from './provider-error';
import { G5SalesProvider, G5CreateOrderRequest } from './g5-sales.provider';

const PRISM_ADDRESS_BASE = 'http://localhost:4010';
const FIXTURE_ADDRESS_BASE = 'http://security.mock';

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

  createQuote(input: {
    address: DeliveryAddress;
    addressId: string;
    cartVersion: number;
    lines: QuoteLine[];
  }): Promise<CheckoutQuote> {
    return this.request('post', 'http://catalog.mock/checkout-quotes', input);
  }

  applyBenefit(quote: CheckoutQuote, couponCode?: string): Promise<CheckoutQuote> {
    return this.request('post', 'http://benefits.mock/apply', { quote, couponCode });
  }

  revalidate(lines: QuoteLine[]): Promise<{ available: boolean; revalidatedAt: string }> {
    return this.request('post', 'http://inventory.mock/revalidate', { lines });
  }

  createOrder(input: {
    customerId: string;
    checkoutOperationId: string;
    idempotencyKey: string;
    contact: CheckoutContact;
    total: Money;
    quote?: {
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
  }): Promise<SalesOrder> {
    if (this.usesG5Sales()) return this.createG5Order(input);
    const { customerId, checkoutOperationId, idempotencyKey, contact, total } = input;
    const body = { checkoutOperationId, contact, total };
    return this.request('post', 'http://sales.mock/orders', body, {
      'Idempotency-Key': idempotencyKey,
      'X-Mock-Idempotency-Scope': this.mockIdempotencyScope(customerId),
    });
  }

  getOrder(orderId: string, customerAccessToken?: string): Promise<SalesOrder> {
    if (this.usesG5Sales()) {
      if (!this.g5Sales || !customerAccessToken) throw new ProviderError(503, 'SALES_INTEGRATION_DISABLED');
      return this.g5Sales.getOrder(orderId, customerAccessToken);
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
    total: Money;
  }): Promise<SalesOrder> {
    if (!this.g5Sales || !input.customerAccessToken) throw new ProviderError(503, 'SALES_INTEGRATION_DISABLED');
    const quote = input.quote;
    const snapshot = quote?.quoteSnapshot;
    if (!quote || !snapshot || !input.paymentMethod?.trim()) {
      throw new ProviderError(409, 'SALES_ORDER_CONTEXT_INCOMPLETE');
    }

    let addresses: DeliveryAddress[];
    try {
      addresses = await this.listAddresses(input.customerId, input.customerAccessToken);
    } catch {
      throw new ProviderError(503, 'SALES_ADDRESS_UNAVAILABLE');
    }
    const address = addresses.find((candidate) => candidate.addressId === quote.addressId);
    if (!address) throw new ProviderError(409, 'SALES_ADDRESS_UNAVAILABLE');
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
        metodoPago: input.paymentMethod,
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
    return this.g5Sales.createOrder(request, input.idempotencyKey);
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
