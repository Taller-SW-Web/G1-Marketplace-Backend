import { HttpService as NestHttpService } from '@nestjs/axios';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { G5OrdersProvider } from './g5-orders.provider';

describe('G5OrdersProvider', () => {
  const values: Record<string, unknown> = {
    VENTAS_BASE_URL: 'https://ventas.example.test',
    G5_SALES_INTEGRATION_APPROVED: 'true',
    USE_MOCKS: false,
    NODE_ENV: 'production',
    HTTP_TIMEOUT_MS: 1500,
  };
  let http: { get: jest.Mock };
  let provider: G5OrdersProvider;

  beforeEach(() => {
    http = { get: jest.fn() };
    const config = { get: (name: string, fallback?: unknown) => values[name] ?? fallback };
    provider = new G5OrdersProvider(http as unknown as NestHttpService, config as ConfigService);
  });

  it('forwards the authenticated user token, translates page 0 to G5 page 1, and maps the response', async () => {
    http.get.mockReturnValue(of({ status: 200, data: {
      items: [{ pedidoId: 'PED-2026-00001', estado: 'CREADO', total: 49.9, moneda: 'PEN', fechaCreacion: '2026-11-24T15:00:00Z' }],
      total: 21, page: 1, pageSize: 10,
    } }));
    const result = await provider.listForCustomer('customer-a', { page: 0, pageSize: 10 }, 'user-token-A');
    expect(http.get).toHaveBeenCalledWith('https://ventas.example.test/api/v1/pedidos/me', expect.objectContaining({
      params: { page: 1, pageSize: 10 },
      headers: expect.objectContaining({ Authorization: 'Bearer user-token-A' }),
      timeout: 1500,
      maxRedirects: 0,
    }));
    expect(result).toEqual({
      data: [{ orderId: 'PED-2026-00001', state: 'CREADO', total: { amount: 49.9, currency: 'PEN' }, createdAt: '2026-11-24T15:00:00Z' }],
      page: { number: 0, size: 10, totalElements: 21, totalPages: 3 },
    });
  });

  it('does not expose another user credential or provider error details on denial', async () => {
    const failure = Object.assign(new Error('provider denied'), { response: { status: 403, data: { token: 'secret' } } });
    http.get.mockReturnValue(throwError(() => failure));
    try {
      await provider.listForCustomer('customer-b', { page: 1, pageSize: 10 }, 'user-token-B');
      throw new Error('Expected G5 authorization failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toEqual({ error: { code: 'ORDERS_ACCESS_DENIED' } });
      expect(JSON.stringify((error as ForbiddenException).getResponse())).not.toContain('secret');
    }
  });

  it('fails closed without explicit integration approval or the user token', async () => {
    const noToken = provider.listForCustomer('customer-a', { page: 0, pageSize: 10 });
    await expect(noToken).rejects.toMatchObject({ status: 503 });
    expect(http.get).not.toHaveBeenCalled();
  });
});
