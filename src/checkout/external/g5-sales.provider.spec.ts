import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import axios from 'axios';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { G5SalesProvider, type G5CreateOrderRequest } from './g5-sales.provider';

const syntheticToken = 'synthetic-test-only-service-token';
const customerToken = 'synthetic-test-only-customer-token';
const idempotencyKey = '00000000-0000-4000-8000-000000000001';
const payload: G5CreateOrderRequest = {
  canal: 'MARKETPLACE',
  contacto: {
    clienteId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
    nombreCompleto: 'Cliente sintético',
    tipoDocumento: 'DNI',
    numeroDocumento: '00000000',
    telefono: '999000000',
    email: 'offline@example.invalid',
  },
  items: [{ productoId: 'PRD-1', sku: 'SKU-1', cantidad: 2, precioUnitario: 100 }],
  envio: {
    modalidad: 'DOMICILIO',
    costo: 15,
    destinatario: 'Cliente sintético',
    departamento: 'Lima',
    provincia: 'Lima',
    distrito: 'Miraflores',
    direccion: 'Dirección ficticia 1',
  },
  pago: { metodoPago: 'SIMULADO', moneda: 'PEN', subtotal: 200, costoEnvio: 15, total: 215 },
};

describe('G5 M1 1.10.0 provider — offline loopback contract', () => {
  let server: Server;
  let baseUrl: string;
  let postStatus = 201;
  let getStatus = 200;
  let getRetryAfter: string | undefined;
  let getRequests = 0;
  let slowBodyMs = 0;
  let withholdFirstCreateResponse = false;
  let postRequests = 0;
  let responseBody: unknown;
  let lastRequest: { method?: string; url?: string; authorization?: string | string[]; idempotencyKey?: string | string[]; body?: unknown } = {};
  const created = new Map<string, string>();

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body: unknown;
        try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
        lastRequest = {
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
          idempotencyKey: request.headers['idempotency-key'],
          body,
        };
        if (request.method === 'GET') {
          getRequests += 1;
          response.writeHead(getStatus, {
            'content-type': 'application/json',
            ...(getRetryAfter ? { 'retry-after': getRetryAfter } : {}),
          });
          response.end(JSON.stringify(responseBody));
          return;
        }
        postRequests += 1;
        const key = String(request.headers['idempotency-key'] ?? '');
        const fingerprint = JSON.stringify(body);
        const previous = created.get(key);
        if (previous && previous !== fingerprint) {
          response.writeHead(409, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ codigo: 'IDEMPOTENCY_KEY_REUSED', mensaje: 'synthetic-only' }));
          return;
        }
        created.set(key, fingerprint);
        response.writeHead(previous ? 200 : postStatus, { 'content-type': 'application/json' });
        if (withholdFirstCreateResponse && !previous) {
          // Leave the committed response pending so the client observes its timeout.
          return;
        }
        if (slowBodyMs > 0) {
          // cabeceras al instante y cuerpo en partes con pausas menores que el timeout de inactividad de Axios:
          // el socket nunca queda inactivo, pero la respuesta completa tarda más que el plazo total
          const full = JSON.stringify(responseBody);
          const parts = full.match(/[\s\S]{1,20}/g) ?? [full];
          let sent = 0;
          const timer = setInterval(() => {
            response.write(parts[sent]);
            sent += 1;
            if (sent === parts.length) { clearInterval(timer); response.end(); }
          }, slowBodyMs);
          response.on('close', () => clearInterval(timer));
          return;
        }
        response.end(JSON.stringify(responseBody));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    postStatus = 201;
    getStatus = 200;
    getRetryAfter = undefined;
    getRequests = 0;
    postRequests = 0;
    withholdFirstCreateResponse = false;
    responseBody = {
      pedidoId: 'PED-2026-00001',
      estado: 'CREADO',
      total: 215,
      moneda: 'PEN',
      canal: 'MARKETPLACE',
      fechaCreacion: '2026-11-24T10:15:00.000Z',
    };
    lastRequest = {};
    slowBodyMs = 0;
    created.clear();
  });

  function provider(overrides: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
      VENTAS_BASE_URL: baseUrl,
      G5_SALES_INTEGRATION_APPROVED: 'true',
      CHECKOUT_SALES_SOURCE: 'g5',
      AUTH_ENABLED: 'true',
      USE_MOCKS: false,
      NODE_ENV: 'test',
      HTTP_TIMEOUT_MS: 1000,
      ...overrides,
    };
    const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback };
    return new G5SalesProvider(new HttpService(axios.create()), config as ConfigService, {
      getAccessToken: jest.fn().mockResolvedValue(syntheticToken),
    } as never);
  }

  describe('total order budget (deadlineAt)', () => {
    const slowToken = (ms: number) => jest.fn(() => new Promise<string>((resolve) => setTimeout(() => resolve(syntheticToken), ms)));
    function budgetProvider(getAccessToken: jest.Mock, overrides: Record<string, unknown> = {}) {
      const values: Record<string, unknown> = {
        VENTAS_BASE_URL: baseUrl, G5_SALES_INTEGRATION_APPROVED: 'true', CHECKOUT_SALES_SOURCE: 'g5',
        AUTH_ENABLED: 'true', USE_MOCKS: false, NODE_ENV: 'test', HTTP_TIMEOUT_MS: 1000, ...overrides,
      };
      const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback };
      return new G5SalesProvider(new HttpService(axios.create()), config as ConfigService, { getAccessToken } as never);
    }

    it('does not start anything when the budget is already spent', async () => {
      const getAccessToken = jest.fn().mockResolvedValue(syntheticToken);
      await expect(budgetProvider(getAccessToken).createOrder(payload, idempotencyKey, Date.now() - 1))
        .rejects.toMatchObject({ status: 504, message: expect.stringContaining('SALES_TIMEOUT') });
      expect(getAccessToken).not.toHaveBeenCalled();
      expect(lastRequest).toEqual({});
    });

    it('gives the technical token only the remaining time and never sends the POST when a slow token spends the budget', async () => {
      const getAccessToken = slowToken(300);
      // el doble recibe el tiempo restante y lo respeta como lo hace el proveedor real
      const racing = jest.fn((remainingMs?: number) => Promise.race([
        getAccessToken(), new Promise<string>((_r, reject) => setTimeout(() => reject({ status: 504 }), remainingMs)),
      ]));
      await expect(budgetProvider(racing as unknown as jest.Mock).createOrder(payload, idempotencyKey, Date.now() + 80))
        .rejects.toBeDefined();
      expect(racing).toHaveBeenCalledTimes(1);
      expect(racing.mock.calls[0][0]).toBeLessThanOrEqual(80);
      expect(racing.mock.calls[0][0]).toBeGreaterThan(0);
      expect(lastRequest).toEqual({});
    });

    it('does not send the POST when the token returns after the budget has expired', async () => {
      const lateToken = jest.fn(() => new Promise<string>((resolve) => setTimeout(() => resolve(syntheticToken), 120)));
      await expect(budgetProvider(lateToken as unknown as jest.Mock).createOrder(payload, idempotencyKey, Date.now() + 60))
        .rejects.toMatchObject({ status: 504 });
      expect(lastRequest).toEqual({});
    });

    it('sends zero POSTs when the budget expires and exactly one creation when the same operation and key are recovered', async () => {
      const posts: Array<{ idempotencyKey: string }> = [];
      const getAccessToken = jest.fn().mockResolvedValue(syntheticToken);
      const http = {
        post: jest.fn((_url: string, _body: unknown, options: { headers: Record<string, string> }) => {
          posts.push({ idempotencyKey: options.headers['Idempotency-Key'] });
          return of({ status: 201, data: {
            pedidoId: 'PED-2026-00006', estado: 'CREADO', total: 215, moneda: 'PEN', canal: 'MARKETPLACE', fechaCreacion: '2026-11-24T10:15:00.000Z',
          } });
        }),
      };
      const config = { get: (key: string, fallback?: unknown) => ({
        VENTAS_BASE_URL: baseUrl, G5_SALES_INTEGRATION_APPROVED: 'true', CHECKOUT_SALES_SOURCE: 'g5',
        AUTH_ENABLED: 'true', USE_MOCKS: false, NODE_ENV: 'test', G5_SALES_TIMEOUT_MS: 30_000,
      } as Record<string, unknown>)[key] ?? fallback };
      const client = new G5SalesProvider(http as unknown as HttpService, config as ConfigService, { getAccessToken } as never);

      await expect(client.createOrder(payload, idempotencyKey, Date.now() - 1)).rejects.toMatchObject({ status: 504 });
      expect(posts).toHaveLength(0);

      const recovered = await client.createOrder(payload, idempotencyKey, Date.now() + 40_000);
      expect(recovered).toMatchObject({ pedidoId: 'PED-2026-00006', estado: 'CREADO' });
      expect(posts).toEqual([{ idempotencyKey }]);
    });

    it('enforces an absolute deadline until the whole body is read and keeps the same key for recovery', async () => {
      const getAccessToken = jest.fn().mockResolvedValue(syntheticToken);
      const client = budgetProvider(getAccessToken);
      slowBodyMs = 60; // cada parte tarda 60 ms (< 180 ms de plazo) pero el cuerpo completo supera el plazo total
      const startedAt = Date.now();
      await expect(client.createOrder(payload, idempotencyKey, Date.now() + 180))
        .rejects.toMatchObject({ status: 504, message: expect.stringContaining('SALES_TIMEOUT') });
      expect(Date.now() - startedAt).toBeLessThan(400);
      // el POST sí llegó a Ventas: se conserva la clave y la recuperación crea una sola alta
      expect(created.size).toBe(1);
      expect(lastRequest).toMatchObject({ method: 'POST', idempotencyKey });
      slowBodyMs = 0;
      await expect(client.createOrder(payload, idempotencyKey, Date.now() + 5_000)).resolves.toMatchObject({ pedidoId: 'PED-2026-00001' });
      expect(created.size).toBe(1);
    });

    it('limits the POST to the remaining budget instead of the configured 30 s', async () => {
      const getAccessToken = jest.fn().mockResolvedValue(syntheticToken);
      const http = { post: jest.fn().mockReturnValue(new Promise(() => undefined)) };
      const config = { get: (key: string, fallback?: unknown) => ({
        VENTAS_BASE_URL: baseUrl, G5_SALES_INTEGRATION_APPROVED: 'true', CHECKOUT_SALES_SOURCE: 'g5',
        AUTH_ENABLED: 'true', USE_MOCKS: false, NODE_ENV: 'test', G5_SALES_TIMEOUT_MS: 30_000,
      } as Record<string, unknown>)[key] ?? fallback };
      const client = new G5SalesProvider(http as unknown as HttpService, config as ConfigService, { getAccessToken } as never);
      void client.createOrder(payload, idempotencyKey, Date.now() + 5_000).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const options = http.post.mock.calls[0][2] as { timeout: number };
      expect(options.timeout).toBeLessThanOrEqual(5_000);
      expect(options.timeout).toBeGreaterThan(4_000);
    });
  });


  it('reports a lost create response without retrying and accepts an explicit same-key replay', async () => {
    withholdFirstCreateResponse = true;
    const client = provider({ G5_SALES_TIMEOUT_MS: 150 });
    await expect(client.createOrder(payload, idempotencyKey)).rejects.toMatchObject({ status: 504 });
    expect(postRequests).toBe(1);
    expect(created.size).toBe(1);
    await expect(client.createOrder(payload, idempotencyKey)).resolves.toMatchObject({ pedidoId: 'PED-2026-00001' });
    expect(postRequests).toBe(2);
    expect(created.size).toBe(1);
  });

  it('posts the pinned M1 request verbatim with the same Idempotency-Key and maps 201/200 responses', async () => {
    const client = provider();
    const first = await client.createOrder(payload, idempotencyKey);
    const replay = await client.createOrder(payload, idempotencyKey);
    expect(first).toEqual({
      pedidoId: 'PED-2026-00001', estado: 'CREADO', total: { amount: 215, currency: 'PEN' },
      createdAt: '2026-11-24T10:15:00.000Z',
    });
    expect(replay).toEqual(first);
    expect(lastRequest).toMatchObject({
      method: 'POST',
      url: '/api/v1/pedidos',
      authorization: `Bearer ${syntheticToken}`,
      idempotencyKey,
      body: payload,
    });
  });

  it('maps M1 1.3 detail fields and recognizes every documented order state', async () => {
    responseBody = {
      pedidoId: 'PED-2026-00001',
      canal: 'MARKETPLACE',
      estado: 'EN_PREPARACION',
      pago: { total: 215, moneda: 'PEN', metodoPago: 'SIMULADO' },
      fechaCreacion: '2026-11-24T10:15:00.000Z',
    };
    const customerOrder = await provider().getOrder('PED-2026-00001', customerToken);
    expect(customerOrder).toEqual({
      pedidoId: 'PED-2026-00001', estado: 'EN_PREPARACION', total: { amount: 215, currency: 'PEN' },
      createdAt: '2026-11-24T10:15:00.000Z',
    });
    expect(lastRequest).toMatchObject({
      method: 'GET', url: '/api/v1/pedidos/PED-2026-00001', authorization: `Bearer ${customerToken}`,
    });
  });

  it('maps idempotency conflict and hides provider authorization errors', async () => {
    await provider().createOrder(payload, idempotencyKey);
    const reused = { ...payload, envio: { ...payload.envio, referencia: 'Referencia sintética diferente' } };
    await expect(provider().createOrder(reused, idempotencyKey)).rejects.toMatchObject({
      status: 409, code: 'IDEMPOTENCY_KEY_REUSED',
    });

    getStatus = 403;
    responseBody = { codigo: 'ACCESO_DENEGADO', mensaje: syntheticToken };
    await expect(provider().getOrder('PED-2026-00001', customerToken)).rejects.toMatchObject({
      status: 403, code: 'SALES_ACCESS_DENIED',
    });
  });

  it.each([{}, { G5_SALES_TIMEOUT_MS: 45_000 }])('uses dedicated G5 timeouts for POST and detail GET (%j)', async (override) => {
    const axiosRef = axios.create();
    const post = jest.spyOn(axiosRef, 'post').mockResolvedValue({ status: 201, data: responseBody });
    const get = jest.spyOn(axiosRef, 'get').mockResolvedValue({ status: 200, data: {
      pedidoId: 'PED-2026-00001', estado: 'CREADO', fechaCreacion: '2026-11-24T10:15:00.000Z',
      pago: { total: 215, moneda: 'PEN' },
    } });
    const values: Record<string, unknown> = {
      VENTAS_BASE_URL: baseUrl, G5_SALES_INTEGRATION_APPROVED: 'true', CHECKOUT_SALES_SOURCE: 'g5',
      AUTH_ENABLED: 'true', USE_MOCKS: false, NODE_ENV: 'test', HTTP_TIMEOUT_MS: 5_000, ...override,
    };
    const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback } as ConfigService;
    const client = new G5SalesProvider(new HttpService(axiosRef), config, {
      getAccessToken: jest.fn().mockResolvedValue(syntheticToken),
    } as never);
    await client.createOrder(payload, idempotencyKey);
    await client.getOrder('PED-2026-00001', customerToken);
    await client.getOrder('PED-2026-00001', customerToken, 2_500);
    const timeout = override.G5_SALES_TIMEOUT_MS ?? 30_000;
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(expect.any(String), payload, expect.objectContaining({
      timeout, headers: expect.objectContaining({ 'Idempotency-Key': idempotencyKey }),
    }));
    expect(get).toHaveBeenNthCalledWith(1, expect.any(String), expect.objectContaining({ timeout }));
    expect(get).toHaveBeenNthCalledWith(2, expect.any(String), expect.objectContaining({ timeout: 2_500 }));
  });

  it('returns G5 Retry-After to the bounded checkout poller without sleeping inside a request', async () => {
    getStatus = 429;
    getRetryAfter = '5';
    await expect(provider().getOrder('PED-2026-00001', customerToken)).rejects.toMatchObject({
      status: 429, code: 'SALES_RATE_LIMITED', retryAfterSeconds: 5,
    });
    expect(getRequests).toBe(1);
  });

  it('fails closed unless explicitly enabled and does not invent an idempotency lookup route', async () => {
    const disabled = provider({ G5_SALES_INTEGRATION_APPROVED: undefined });
    await expect(disabled.createOrder(payload, idempotencyKey)).rejects.toMatchObject({
      status: 503, code: 'SALES_INTEGRATION_DISABLED',
    });
    const client = provider();
    expect(() => client.getOrderByIdempotencyKey(idempotencyKey)).toThrow(expect.objectContaining({
      status: 501, code: 'SALES_IDEMPOTENCY_LOOKUP_UNSUPPORTED',
    }));
    expect(lastRequest.url).toBeUndefined();
  });

  it('rejects inconsistent monetary requests and malformed provider responses', async () => {
    await expect(provider().createOrder({ ...payload, pago: { ...payload.pago, total: 999 } }, idempotencyKey))
      .rejects.toMatchObject({ status: 400, code: 'SALES_REQUEST_INVALID' });
    responseBody = { pedidoId: 'PED-2026-00001', estado: 'CREADO', total: '215', moneda: 'PEN', fechaCreacion: 'bad' };
    await expect(provider().createOrder(payload, idempotencyKey)).rejects.toMatchObject({
      status: 502, code: 'SALES_RESPONSE_INVALID',
    });
  });
});
