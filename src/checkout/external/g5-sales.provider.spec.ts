import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import axios from 'axios';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
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
    responseBody = {
      pedidoId: 'PED-2026-00001',
      estado: 'CREADO',
      total: 215,
      moneda: 'PEN',
      canal: 'MARKETPLACE',
      fechaCreacion: '2026-11-24T10:15:00.000Z',
    };
    lastRequest = {};
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
