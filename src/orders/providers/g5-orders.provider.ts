import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
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
        this.config.get<boolean>('USE_MOCKS', false) || (base.protocol !== 'https:' && !localHttp) ||
        base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
      throw this.unavailable();
    }

    const page = query.page + 1;
    try {
      const response = await firstValueFrom(this.http.get<unknown>(new URL('/api/v1/pedidos/me', base).href, {
        params: { page, pageSize: query.pageSize },
        headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
        timeout: this.config.get<number>('HTTP_TIMEOUT_MS', 3000),
        maxRedirects: 0,
        proxy: false,
      }));
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
      if (error instanceof ServiceUnavailableException || error instanceof UnauthorizedException || error instanceof ForbiddenException) throw error;
      const status = (error as AxiosError).response?.status;
      if (status === 401) throw new UnauthorizedException({ error: { code: 'ORDERS_AUTHENTICATION_FAILED' } });
      if (status === 403) throw new ForbiddenException({ error: { code: 'ORDERS_ACCESS_DENIED' } });
      throw this.unavailable();
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({ error: { code: 'ORDERS_INTEGRATION_UNAVAILABLE' } });
  }
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
