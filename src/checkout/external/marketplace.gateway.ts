import { HttpService } from '@nestjs/axios';
import {
  Injectable,
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
  ) {}

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
  }): Promise<SalesOrder> {
    const { customerId, idempotencyKey, ...body } = input;
    return this.request('post', 'http://sales.mock/orders', body, {
      'Idempotency-Key': idempotencyKey,
      'X-Mock-Idempotency-Scope': this.mockIdempotencyScope(customerId),
    });
  }

  getOrder(orderId: string): Promise<SalesOrder> {
    return this.request('get', `http://sales.mock/orders/${encodeURIComponent(orderId)}`);
  }

  getOrderByIdempotencyKey(idempotencyKey: string, customerId: string): Promise<SalesOrder> {
    return this.request(
      'get',
      `http://sales.mock/orders/by-idempotency-key/${encodeURIComponent(idempotencyKey)}`,
      undefined,
      { 'X-Mock-Idempotency-Scope': this.mockIdempotencyScope(customerId) },
    );
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
