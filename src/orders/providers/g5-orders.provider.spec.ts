import { HttpService as NestHttpService } from '@nestjs/axios';
import { ForbiddenException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { G5OrdersProvider } from './g5-orders.provider';

describe('G5OrdersProvider', () => {
  const values: Record<string, unknown> = {
    VENTAS_BASE_URL: 'https://ventas.example.test',
    G5_SALES_INTEGRATION_APPROVED: 'true',
    AUTH_ENABLED: 'true',
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

  it('passes status and inclusive Peru date filters to G5', async () => {
    http.get.mockReturnValue(of({ status: 200, data: { items: [], total: 0, page: 2, pageSize: 5 } }));
    await provider.listForCustomer('customer-a', {
      page: 1, pageSize: 5, state: 'PAGADO', from: '2026-11-01', to: '2026-11-26',
    }, 'user-token-A');
    expect(http.get).toHaveBeenCalledWith('https://ventas.example.test/api/v1/pedidos/me', expect.objectContaining({
      params: { page: 2, pageSize: 5, estado: 'PAGADO', desde: '2026-11-01', hasta: '2026-11-26' },
    }));
  });

  it('maps a known filter error without exposing the provider response', async () => {
    const error = { response: { status: 400, data: { codigo: 'RANGO_FECHAS_INVALIDO', internal: 'private' } } };
    http.get.mockReturnValue(throwError(() => error));
    await expect(provider.listForCustomer('customer-a', { page: 0, pageSize: 10 }, 'user-token-A'))
      .rejects.toMatchObject({ status: 400, response: { code: 'RANGO_FECHAS_INVALIDO' } });
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

  it('uses the authenticated customer token for detail and preserves G5 owner-isolation 403', async () => {
    const failure = Object.assign(new Error('provider denied'), { response: { status: 403, data: { token: 'secret' } } });
    http.get.mockReturnValue(throwError(() => failure));
    await expect(provider.getForCustomer('PED-2026-00001', 'user-token-B', 'customer-b'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(http.get).toHaveBeenCalledWith('https://ventas.example.test/api/v1/pedidos/PED-2026-00001', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer user-token-B' }),
      maxRedirects: 0,
    }));
  });

  it('maps the order detail without exposing the provider PII snapshot', async () => {
    http.get.mockReturnValue(of({ status: 200, data: {
      pedidoId: 'PED-2026-00001', estado: 'PAGADO', fechaCreacion: '2026-11-24T15:00:00Z',
      contacto: { nombreCompleto: 'Synthetic Buyer', numeroDocumento: 'secret-pii' },
      pago: { total: 129.9, moneda: 'PEN' },
    } }));
    const result = await provider.getForCustomer('PED-2026-00001', 'user-token-A', 'customer-a');
    expect(result).toEqual({
      orderId: 'PED-2026-00001', state: 'PAGADO', total: { amount: 129.9, currency: 'PEN' },
      createdAt: '2026-11-24T15:00:00Z',
    });
    expect(JSON.stringify(result)).not.toContain('secret-pii');
  });

  it('waits for Retry-After before retrying a rate-limited customer read', async () => {
    const limited = Object.assign(new Error('rate limited'), { response: {
      status: 429, headers: { 'retry-after': '0' }, data: {},
    } });
    http.get.mockReturnValueOnce(throwError(() => limited)).mockReturnValueOnce(of({ status: 200, data: {
      items: [], total: 0, page: 1, pageSize: 10,
    } }));
    await expect(provider.listForCustomer('customer-a', { page: 0, pageSize: 10 }, 'user-token-A'))
      .resolves.toMatchObject({ data: [], page: { totalElements: 0 } });
    expect(http.get).toHaveBeenCalledTimes(2);
  });

  it('returns retry guidance when Retry-After exceeds the one-minute polling budget', async () => {
    const limited = Object.assign(new Error('rate limited'), { response: {
      status: 429, headers: { 'retry-after': '120' }, data: {},
    } });
    http.get.mockReturnValue(throwError(() => limited));
    await expect(provider.getForCustomer('PED-2026-00001', 'user-token-A', 'customer-a'))
      .rejects.toMatchObject({ constructor: HttpException, status: 429 });
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('fails closed without explicit integration approval or the user token', async () => {
    const noToken = provider.listForCustomer('customer-a', { page: 0, pageSize: 10 });
    await expect(noToken).rejects.toMatchObject({ status: 503 });
    expect(http.get).not.toHaveBeenCalled();
  });
});
