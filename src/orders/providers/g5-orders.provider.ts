import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable, ServiceUnavailableException, UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { OrdersHistoryResponse, OrdersProvider, ListOrdersQuery } from '../orders.types';

type G5Order = {
  pedidoId: string;
  estado: string;
  total: number;
  moneda: string;
  fechaCreacion: string;
};

@Injectable()
export class G5OrdersProvider implements OrdersProvider {
  constructor(private readonly http: HttpService, private readonly config: ConfigService) {}

  async listForCustomer(_customerId: string, query: ListOrdersQuery, accessToken?: string): Promise<OrdersHistoryResponse> {
    const baseUrl = this.config.get<string>('VENTAS_BASE_URL');
    let base: URL;
    try { base = new URL(baseUrl ?? ''); } catch { throw this.unavailable(); }
    const localHttp = this.config.get<string>('NODE_ENV') !== 'production' && base.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
      if (!accessToken || this.config.get<string>('G5_SALES_INTEGRATION_APPROVED') !== 'true' ||
        this.config.get<string>('AUTH_ENABLED') !== 'true' || this.config.get<boolean>('USE_MOCKS', false) || (base.protocol !== 'https:' && !localHttp) ||
        base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
      throw this.unavailable();
    }

    const page = query.page + 1;
    try {
      const response = await this.get<unknown>(new URL('/api/v1/pedidos/me', base).href, {
        params: { page, pageSize: query.pageSize },
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        timeout: this.config.get<number>('HTTP_TIMEOUT_MS', 3000),
        maxRedirects: 0,
        proxy: false,
      });
      if (response.status !== 200 || !isRecord(response.data) || !Array.isArray(response.data.items) ||
          !Number.isSafeInteger(response.data.total) || Number(response.data.total) < 0 ||
          response.data.page !== page || response.data.pageSize !== query.pageSize) throw this.unavailable();
      const orders = response.data.items.map(mapOrder);
      if (orders.some((order) => !order)) throw this.unavailable();
      const totalElements = Number(response.data.total);
      return {
        data: orders as NonNullable<typeof orders[number]>[],
        page: { number: query.page, size: query.pageSize, totalElements, totalPages: Math.ceil(totalElements / query.pageSize) },
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof UnauthorizedException || error instanceof ForbiddenException ||
          error instanceof HttpException && error.getStatus() === 429) throw error;
      const status = (error as AxiosError).response?.status;
      if (status === 401) throw new UnauthorizedException({ error: { code: 'ORDERS_AUTHENTICATION_FAILED' } });
      if (status === 403) throw new ForbiddenException({ error: { code: 'ORDERS_ACCESS_DENIED' } });
      throw this.unavailable();
    }
  }

  async getForCustomer(orderId: string, accessToken?: string, _customerId?: string): Promise<NonNullable<ReturnType<typeof mapOrder>>> {
    const base = this.baseUrl();
    if (!accessToken || !/^[A-Za-z0-9._~-]{1,8192}$/u.test(accessToken) ||
        this.config.get<string>('G5_SALES_INTEGRATION_APPROVED') !== 'true' ||
        this.config.get<string>('AUTH_ENABLED') !== 'true' || this.config.get<boolean>('USE_MOCKS', false)) {
      throw this.unavailable();
    }
    if (!/^PED-\d{4}-\d{5}$/u.test(orderId)) throw new NotFoundException({ error: { code: 'ORDER_NOT_FOUND' } });
    try {
      const response = await this.get<unknown>(new URL(`/api/v1/pedidos/${encodeURIComponent(orderId)}`, base).href, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        timeout: this.config.get<number>('HTTP_TIMEOUT_MS', 3000),
        maxRedirects: 0,
        proxy: false,
      });
      if (response.status !== 200 || !isRecord(response.data) || !isRecord(response.data.pago)) throw this.unavailable();
      const mapped = mapOrder({
        pedidoId: response.data.pedidoId,
        estado: response.data.estado,
        total: response.data.pago.total,
        moneda: response.data.pago.moneda,
        fechaCreacion: response.data.fechaCreacion,
      });
      if (!mapped) throw this.unavailable();
      return mapped;
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof UnauthorizedException ||
          error instanceof ForbiddenException || error instanceof NotFoundException ||
          error instanceof HttpException && error.getStatus() === 429) throw error;
      const status = (error as AxiosError).response?.status;
      if (status === 401) throw new UnauthorizedException({ error: { code: 'ORDERS_AUTHENTICATION_FAILED' } });
      if (status === 403) throw new ForbiddenException({ error: { code: 'ORDERS_ACCESS_DENIED' } });
      if (status === 404) throw new NotFoundException({ error: { code: 'ORDER_NOT_FOUND' } });
      throw this.unavailable();
    }
  }

  private async get<T>(url: string, options: Parameters<HttpService['get']>[1]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await firstValueFrom(this.http.get<T>(url, options));
      } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status !== 429) throw error;
        const retryAfterSeconds = readRetryAfter(axiosError.response.headers?.['retry-after']);
        if (attempt === 0 && retryAfterSeconds !== undefined && retryAfterSeconds <= 60) {
          await new Promise((resolve) => setTimeout(resolve, retryAfterSeconds * 1000));
          continue;
        }
        throw new HttpException({ error: { code: 'SALES_RATE_LIMITED', retryAfterSeconds } }, 429);
      }
    }
    throw this.unavailable();
  }

  private baseUrl(): URL {
    const baseUrl = this.config.get<string>('VENTAS_BASE_URL');
    let base: URL;
    try { base = new URL(baseUrl ?? ''); } catch { throw this.unavailable(); }
    const localHttp = this.config.get<string>('NODE_ENV') !== 'production' && base.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if ((base.protocol !== 'https:' && !localHttp) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
      throw this.unavailable();
    }
    return base;
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({ error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' } });
  }
}

function readRetryAfter(value: unknown): number | undefined {
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== 'string') return undefined;
  const seconds = /^\d{1,6}$/u.test(header) ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);
  return Number.isInteger(seconds) && seconds >= 0 && seconds <= 86400 ? seconds : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapOrder(value: unknown) {
  if (!isRecord(value) || typeof value.pedidoId !== 'string' || !value.pedidoId.trim() ||
      typeof value.estado !== 'string' || !value.estado.trim() || typeof value.total !== 'number' ||
      !Number.isFinite(value.total) || value.total < 0 || typeof value.moneda !== 'string' ||
      !/^[A-Z]{3}$/.test(value.moneda) || typeof value.fechaCreacion !== 'string' ||
      Number.isNaN(Date.parse(value.fechaCreacion))) return undefined;
  return {
    orderId: value.pedidoId,
    state: value.estado,
    total: { amount: value.total, currency: value.moneda },
    createdAt: value.fechaCreacion,
  };
}
