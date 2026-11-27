import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import axios from 'axios';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { G5SalesProvider, type G5CreateOrderRequest } from './g5-sales.provider';

const syntheticToken = 'synthetic-test-only-service-token';
const customerToken = 'synthetic-test-only-customer-token';
const idempotencyKey = '00000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-24T10:15:00.000Z';
const m1Error = (codigo: string) => ({ codigo, mensaje: 'synthetic upstream detail', timestamp });
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

type CapturedRequest = {
  method?: string;
  url?: string;
  authorization?: string;
  idempotencyKey?: string | string[];
  contentType?: string;
  rawBody: string;
  body: unknown;
};

const expectedCreateRequest: CapturedRequest = {
  method: 'POST', url: '/api/v1/pedidos', authorization: `Bearer ${syntheticToken}`,
  idempotencyKey, contentType: 'application/json', rawBody: JSON.stringify(payload), body: payload,
};
const mappedOrder = {
  pedidoId: 'PED-2026-00001', estado: 'CREADO', total: { amount: 215, currency: 'PEN' },
  createdAt: timestamp,
};

describe('G5 M1 1.10.0 provider — offline loopback contract', () => {
  let server: Server;
  let baseUrl: string;
  let postStatus = 201;
  let getStatus = 200;
  let getRetryAfter: string | undefined;
  let getRequests = 0;
  let withholdFirstCreateResponse = false;
  let responseBody: unknown;
  const requests: CapturedRequest[] = [];
  const created = new Map<string, string>();

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body: unknown;
        try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
        requests.push({
          method: request.method,
          url: request.url,
          authorization: request.headers.authorization,
          idempotencyKey: request.headers['idempotency-key'],
          contentType: request.headers['content-type'],
          rawBody: raw,
          body,
        });
        if (request.method === 'GET') {
          getRequests += 1;
          response.writeHead(getStatus, {
            'content-type': 'application/json',
            ...(getRetryAfter ? { 'retry-after': getRetryAfter } : {}),
          });
          response.end(JSON.stringify(responseBody));
          return;
        }
        if (request.method !== 'POST' || request.url !== '/api/v1/pedidos') {
          response.writeHead(404).end();
          return;
        }
        if (postStatus !== 201) {
          response.writeHead(postStatus, { 'content-type': 'application/json' });
          response.end(JSON.stringify(responseBody));
          return;
        }
        const key = String(request.headers['idempotency-key'] ?? '');
        const fingerprint = JSON.stringify(body);
        const previous = created.get(key);
        if (previous && previous !== fingerprint) {
          response.writeHead(409, { 'content-type': 'application/json' });
          response.end(JSON.stringify(m1Error('IDEMPOTENCY_KEY_REUSED')));
          return;
        }
        created.set(key, fingerprint);
        // Simulate a committed create whose response never reaches the caller.
        if (!previous && withholdFirstCreateResponse) return;
        response.writeHead(previous ? 200 : 201, { 'content-type': 'application/json' });
        response.end(JSON.stringify(responseBody));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
  });

  beforeEach(() => {
    postStatus = 201;
    getStatus = 200;
    getRetryAfter = undefined;
    getRequests = 0;
    withholdFirstCreateResponse = false;
    responseBody = {
      pedidoId: 'PED-2026-00001',
      estado: 'CREADO',
      total: 215,
      moneda: 'PEN',
      canal: 'MARKETPLACE',
      fechaCreacion: timestamp,
    };
    requests.length = 0;
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
    expect(first).toEqual(mappedOrder);
    expect(replay).toEqual(first);
    expect(requests).toEqual([expectedCreateRequest, expectedCreateRequest]);
  });

  it('reports a lost create response without retrying and accepts an explicit same-key replay', async () => {
    withholdFirstCreateResponse = true;
    const client = provider({ G5_SALES_TIMEOUT_MS: 500 });

    await expect(client.createOrder(payload, idempotencyKey)).rejects.toMatchObject({
      status: 504, code: 'SALES_TIMEOUT', message: 'SALES_TIMEOUT',
    });
    expect(requests).toEqual([expectedCreateRequest]);

    // This is an adapter-level replay with caller-supplied input, not a checkout reconstruction test.
    await expect(client.createOrder(payload, idempotencyKey)).resolves.toEqual(mappedOrder);
    expect(requests).toEqual([expectedCreateRequest, expectedCreateRequest]);
  });

  it.each([
    [400, 'DOCUMENTO_INVALIDO', 'DOCUMENTO_INVALIDO'],
    [401, 'TOKEN_INVALIDO', 'SALES_AUTHENTICATION_FAILED'],
    [403, 'ACCESO_DENEGADO', 'SALES_ACCESS_DENIED'],
  ])('maps create HTTP %i / %s without leaking the M1 error message', async (status, codigo, code) => {
    postStatus = status;
    responseBody = m1Error(codigo);

    await expect(provider().createOrder(payload, idempotencyKey)).rejects.toMatchObject({
      status, code, message: code,
    });
    expect(requests).toEqual([expectedCreateRequest]);
  });

  it('rejects a non-v4 idempotency key before contacting M1', async () => {
    await expect(provider().createOrder(payload, '00000000-0000-1000-8000-000000000001')).rejects.toMatchObject({
      status: 400, code: 'IDEMPOTENCY_KEY_INVALID', message: 'IDEMPOTENCY_KEY_INVALID',
    });
    expect(requests).toEqual([]);
  });

  it('maps M1 1.3 detail fields using only the customer bearer', async () => {
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
    expect(requests).toEqual([{
      method: 'GET', url: '/api/v1/pedidos/PED-2026-00001', authorization: `Bearer ${customerToken}`,
      idempotencyKey: undefined, contentType: undefined, rawBody: '', body: undefined,
    }]);
  });

  it('maps idempotency conflict and hides provider authorization errors', async () => {
    await provider().createOrder(payload, idempotencyKey);
    const reused = { ...payload, envio: { ...payload.envio, referencia: 'Referencia sintética diferente' } };
    await expect(provider().createOrder(reused, idempotencyKey)).rejects.toMatchObject({
      status: 409, code: 'IDEMPOTENCY_KEY_REUSED',
    });

    getStatus = 403;
    responseBody = m1Error('ACCESO_DENEGADO');
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
    expect(requests).toEqual([]);
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
