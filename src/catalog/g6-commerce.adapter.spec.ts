import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createG6CommerceAdapter, G6_COMMERCE_PIN } from './g6-commerce.adapter';

const correlationId = '4b89f2b0-94d5-4b7f-862e-3a7a89d04d20';
const pricePayload = {
  sku: 'SKU-1',
  precio_regular: 100,
  precio_oferta: 80,
  currency: 'PEN',
  channel_id: 'MARKETPLACE',
  valid_from: '2026-01-01T00:00:00.000Z',
  valid_until: '2027-01-01T00:00:00.000Z',
  price_version: 3,
  vigencia_id: 'price-period-1',
  origen: 'PRODUCTO',
};

describe('G6 commerce adapter (synthetic loopback only)', () => {
  let server: Server;
  let baseUrl: string;
  let responseStatus = 200;
  let responseBody: unknown = pricePayload;
  let responseText: string | undefined;
  let responseDelayMs = 0;
  let lastRequest: { url?: string; authorization?: string; correlationId?: string | string[] } = {};

  beforeAll(async () => {
    server = createServer((request, response) => {
      lastRequest = {
        url: request.url,
        authorization: request.headers.authorization,
        correlationId: request.headers['x-correlation-id'],
      };
      const send = () => {
        response.writeHead(responseStatus, { 'content-type': 'application/json' });
        response.end(responseText ?? JSON.stringify(responseBody));
      };
      if (responseDelayMs > 0) setTimeout(send, responseDelayMs);
      else send();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    responseStatus = 200;
    responseBody = pricePayload;
    responseText = undefined;
    responseDelayMs = 0;
    lastRequest = {};
  });

  function createAdapter(overrides: Record<string, string | undefined> = {}, fetchImpl?: typeof fetch) {
    const env = {
      NODE_ENV: 'test',
      PRODUCTOS_BASE_URL: baseUrl,
      PRODUCTOS_TIMEOUT_MS: '1000',
      PRODUCTOS_COMMERCE_CONTRACT_VERSION: G6_COMMERCE_PIN.version,
      PRODUCTOS_COMMERCE_CONTRACT_BLOB: G6_COMMERCE_PIN.gitBlob,
      CATALOG_INTEGRATION_APPROVED: 'true',
      PRODUCTOS_PRICE_INTEGRATION_APPROVED: 'true',
      PRODUCTOS_AVAILABILITY_INTEGRATION_APPROVED: 'true',
      ...overrides,
    };
    return createG6CommerceAdapter(env, async () => 'Bearer local-synthetic-token', fetchImpl);
  }

  it('fails closed before auth or network when the price integration grant is not approved', async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response());
    const adapter = createAdapter({ PRODUCTOS_PRICE_INTEGRATION_APPROVED: undefined }, fetchMock);
    await expect(adapter.getPrice({ productId: 'PRD-1', sku: 'SKU-1' })).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'PRICING_UNAVAILABLE' } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(lastRequest.url).toBeUndefined();
  });

  it('maps G6 price fields and sends authorization and X-Correlation-Id to loopback', async () => {
    const result = await createAdapter().getPrice({ productId: 'PRD-1', sku: 'SKU-1', requestId: correlationId });
    expect(result).toMatchObject({
      data: {
        productId: 'PRD-1',
        sku: 'SKU-1',
        price: { regularAmount: 100, saleAmount: 80, currency: 'PEN', discountPercent: 20, priceVersion: 3 },
      },
      meta: { channel: 'MARKETPLACE' },
    });
    expect(lastRequest.url).toBe('/api/v1/precios/skus/SKU-1?canal=MARKETPLACE');
    expect(lastRequest.authorization).toBe('Bearer local-synthetic-token');
    expect(lastRequest.correlationId).toBe(correlationId);
  });

  it('maps commercial availability without exposing balances or locations', async () => {
    responseBody = { items: [{ sku: 'SKU-1', status: 'INDETERMINADO' }] };
    const result = await createAdapter().getAvailability({ productId: 'PRD-1', sku: 'SKU-1', requestId: correlationId });
    expect(result.data).toMatchObject({ productId: 'PRD-1', sku: 'SKU-1', availability: 'UNDETERMINED' });
    expect(Object.keys(result.data).sort()).toEqual(['availability', 'checkedAt', 'productId', 'sku']);
    expect(lastRequest.url).toBe('/api/v1/inventario/disponibilidad/comercial?skus=SKU-1&canal=MARKETPLACE');
    expect(lastRequest.correlationId).toBe(correlationId);
  });

  it('maps provider not-found, authorization failures, invalid JSON, and timeout without leaking provider bodies', async () => {
    responseStatus = 404;
    responseBody = { code: 'PRECIO_NO_ENCONTRADO', internal: 'must-not-leak' };
    await expect(createAdapter().getPrice({ productId: 'PRD-1', sku: 'SKU-1' })).rejects.toMatchObject({
      status: 422,
      response: { error: { code: 'PRICE_NOT_AVAILABLE' } },
    });

    responseStatus = 403;
    responseBody = { code: 'SCOPE_INSUFICIENTE', internal: 'must-not-leak' };
    const forbidden = createAdapter().getAvailability({ productId: 'PRD-1', sku: 'SKU-1' });
    await expect(forbidden).rejects.toMatchObject({
      status: 503,
      response: { error: { code: 'INVENTORY_UNAVAILABLE' } },
    });

    responseStatus = 200;
    responseText = '{invalid json';
    await expect(createAdapter().getPrice({ productId: 'PRD-1', sku: 'SKU-1' })).rejects.toMatchObject({
      status: 502,
      response: { error: { code: 'PRICING_INVALID_RESPONSE' } },
    });

    responseText = undefined;
    responseDelayMs = 250;
    await expect(createAdapter({ PRODUCTOS_TIMEOUT_MS: '100' }).getPrice({ productId: 'PRD-1', sku: 'SKU-1' })).rejects.toMatchObject({
      status: 504,
      response: { error: { code: 'PRICING_TIMEOUT' } },
    });
  }, 5000);

  it('rejects contract pin mismatch at construction', () => {
    expect(() => createAdapter({ PRODUCTOS_COMMERCE_CONTRACT_VERSION: '0.6.0-rc.1' })).toThrow();
    expect(() => createAdapter({ PRODUCTOS_COMMERCE_CONTRACT_BLOB: 'f64bfe9a097b2a0f74c2600988305443d92f640e' })).toThrow();
  });
});
