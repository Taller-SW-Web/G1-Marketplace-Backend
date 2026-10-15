import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  CheckoutContact,
  CheckoutQuote,
  DeliveryAddress,
  Money,
  QuoteLine,
  SalesOrder,
} from '../checkout.types';
import { ProviderError } from './provider-error';

interface Envelope<T> {
  data: T;
}

@Injectable()
export class MarketplaceGateway {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  listAddresses(accessToken: string): Promise<DeliveryAddress[]> {
    return this.request('get', 'http://security.mock/delivery-addresses', undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
  }

  createAddress(accessToken: string, address: Omit<DeliveryAddress, 'addressId'>): Promise<DeliveryAddress> {
    return this.request('post', 'http://security.mock/delivery-addresses', address, {
      Authorization: `Bearer ${accessToken}`,
    });
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
    checkoutOperationId: string;
    idempotencyKey: string;
    contact: CheckoutContact;
    total: Money;
  }): Promise<SalesOrder> {
    const { idempotencyKey, ...body } = input;
    return this.request('post', 'http://sales.mock/orders', body, {
      'Idempotency-Key': idempotencyKey,
    });
  }

  getOrder(orderId: string): Promise<SalesOrder> {
    return this.request('get', `http://sales.mock/orders/${encodeURIComponent(orderId)}`);
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
