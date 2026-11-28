import { ConfigService } from '@nestjs/config';
import { G6CheckoutProvider, CHECKOUT_G6_PIN, CHECKOUT_G6_SCOPES } from './g6-checkout.provider';

const token = `e30.${Buffer.from(JSON.stringify({
  aud: ['api-productos'],
  scope: CHECKOUT_G6_SCOPES.join(' '),
})).toString('base64url')}.synthetic-signature`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('G6CheckoutProvider (synthetic HTTP only)', () => {
  const values: Record<string, unknown> = {};
  let provider: G6CheckoutProvider;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    Object.assign(values, {
      NODE_ENV: 'test',
      USE_MOCKS: false,
      CHECKOUT_G6_SOURCE: 'real',
      CHECKOUT_G6_INTEGRATION_APPROVED: 'true',
      CHECKOUT_G6_PRICE_APPROVED: 'true',
      CHECKOUT_G6_QUANTITY_APPROVED: 'true',
      CHECKOUT_G6_CONTRACT_VERSION: CHECKOUT_G6_PIN.version,
      CHECKOUT_G6_CONTRACT_BLOB: CHECKOUT_G6_PIN.gitBlob,
      PRODUCTOS_BASE_URL: 'https://g6.example.test',
      G7_TOKEN_URL: 'https://g7.example.test/api/v1/auth/token',
      PRODUCTOS_CLIENT_SECRET: 'synthetic-client-secret-not-a-credential',
      WISHLIST_COMMERCE_AUTH_MODE: 'client-credentials',
      PRODUCTOS_TIMEOUT_MS: '1000',
    });
    provider = new G6CheckoutProvider({
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as unknown as ConfigService);
    fetchMock = jest.spyOn(global, 'fetch');
    fetchMock.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url === values.G7_TOKEN_URL) {
        return jsonResponse({ accessToken: token, tokenType: 'Bearer', expiresIn: 3600, scopes: [...CHECKOUT_G6_SCOPES] });
      }
      if (url.includes('/precios/skus/')) {
        return jsonResponse({
          sku: 'ADI-ENT22-AZU-M', currency: 'PEN', precio_regular: 89.9, precio_oferta: 79.9,
          price_version: 4, channel_id: 'MARKETPLACE', vigencia_id: 'vigencia-synthetic', origen: 'SKU_OVERRIDE',
          valid_from: '2026-01-01T00:00:00.000Z', valid_until: null,
        });
      }
      if (url.includes('/inventario/disponibilidad/comercial/verificar')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { lines: Array<{ sku: string; quantity: number }> };
        return jsonResponse({
          evaluated_at: '2026-11-27T12:00:00.000Z', binding: false,
          items: body.lines.map((line) => ({
            sku: line.sku, requested_quantity: line.quantity, result: 'SUFICIENTE', reason_code: null,
          })),
        });
      }
      return jsonResponse({ code: 'NOT_FOUND' }, 404);
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
    for (const key of Object.keys(values)) delete values[key];
  });

  it('maps the current G6 SKU price and requests only the pinned commercial route', async () => {
    await expect(provider.getPrice('ADI-ENT22-AZU-M')).resolves.toEqual({
      amount: 79.9, currency: 'PEN', version: 4,
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'https://g7.example.test/api/v1/auth/token',
      'https://g6.example.test/api/v1/precios/skus/ADI-ENT22-AZU-M?canal=MARKETPLACE',
    ]);
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(new Headers(request.headers).get('Authorization')).toBe(`Bearer ${token}`);
    expect(new Headers(request.headers).get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects an expired price as a conflict, without treating it as a current quote', async () => {
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => String(input) === values.G7_TOKEN_URL
      ? jsonResponse({ accessToken: token, tokenType: 'Bearer', expiresIn: 3600, scopes: [...CHECKOUT_G6_SCOPES] })
      : jsonResponse({
        sku: 'ADI-ENT22-AZU-M', currency: 'PEN', precio_regular: 89.9, precio_oferta: 79.9,
        price_version: 4, channel_id: 'MARKETPLACE', vigencia_id: 'vigencia-expirada', origen: 'SKU_OVERRIDE',
        valid_from: '2026-01-01T00:00:00.000Z', valid_until: new Date(Date.now() - 1000).toISOString(),
      }));

    await expect(provider.getPrice('ADI-ENT22-AZU-M')).rejects.toMatchObject({
      status: 409, code: 'G6_PRICE_EXPIRED',
    });
  });

  it.each([
    [404, 409, 'G6_PRICE_NOT_AVAILABLE'],
    [403, 503, 'G6_PRICE_UNAVAILABLE'],
    [502, 503, 'G6_PRICE_UNAVAILABLE'],
  ])('fails closed for G6 price HTTP %i', async (httpStatus, expectedStatus, code) => {
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => String(input) === values.G7_TOKEN_URL
      ? jsonResponse({ accessToken: token, tokenType: 'Bearer', expiresIn: 3600, scopes: [...CHECKOUT_G6_SCOPES] })
      : jsonResponse({ code: 'SYNTHETIC_PROVIDER_ERROR' }, httpStatus));

    await expect(provider.getPrice('ADI-ENT22-AZU-M')).rejects.toMatchObject({
      status: expectedStatus, code,
    });
  });

  it('maps an upstream timeout to a bounded 504 without falling back to a fixture price', async () => {
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => {
      if (String(input) === values.G7_TOKEN_URL) {
        return jsonResponse({ accessToken: token, tokenType: 'Bearer', expiresIn: 3600, scopes: [...CHECKOUT_G6_SCOPES] });
      }
      throw Object.assign(new Error('synthetic timeout'), { name: 'TimeoutError' });
    });

    await expect(provider.getPrice('ADI-ENT22-AZU-M')).rejects.toMatchObject({
      status: 504, code: 'G6_CHECKOUT_TIMEOUT',
    });
  });

  it('verifies the requested quantities using ENVIO_DOMICILIO without reserving stock', async () => {
    await expect(provider.verifyQuantities([{ sku: 'ADI-ENT22-AZU-M', quantity: 2 }])).resolves.toEqual({
      available: true, revalidatedAt: '2026-11-27T12:00:00.000Z',
    });
    const request = fetchMock.mock.calls.find(([input]) => String(input).includes('/verificar'))?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      channel_id: 'MARKETPLACE',
      fulfillment: { mode: 'ENVIO_DOMICILIO' },
      lines: [{ sku: 'ADI-ENT22-AZU-M', quantity: 2 }],
    });
  });

  it('returns insufficient quantity as unavailable and fails closed on indeterminate results', async () => {
    fetchMock.mockImplementation(async (input: URL | RequestInfo, init?: RequestInit) => {
      if (String(input) === values.G7_TOKEN_URL) {
        return jsonResponse({ accessToken: token, tokenType: 'Bearer', expiresIn: 3600, scopes: [...CHECKOUT_G6_SCOPES] });
      }
      const body = JSON.parse(String(init?.body ?? '{}')) as { lines: Array<{ sku: string; quantity: number }> };
      return jsonResponse({ evaluated_at: new Date().toISOString(), binding: false, items: body.lines.map((line) => ({
        sku: line.sku, requested_quantity: line.quantity, result: 'INSUFICIENTE', reason_code: 'STOCK_LIMIT',
      })) });
    });
    await expect(provider.verifyQuantities([{ sku: 'ADI-ENT22-AZU-M', quantity: 2 }])).resolves.toMatchObject({ available: false });

    const indeterminate = new G6CheckoutProvider({
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as unknown as ConfigService);
    fetchMock.mockImplementation(async (input: URL | RequestInfo) => String(input) === values.G7_TOKEN_URL
      ? jsonResponse({ accessToken: token, tokenType: 'Bearer', expiresIn: 3600, scopes: [...CHECKOUT_G6_SCOPES] })
      : jsonResponse({ evaluated_at: new Date().toISOString(), binding: false, items: [{
        sku: 'ADI-ENT22-AZU-M', requested_quantity: 1, result: 'INDETERMINADO', reason_code: 'FULFILLMENT_UNMAPPED',
      }] }));
    await expect(indeterminate.verifyQuantities([{ sku: 'ADI-ENT22-AZU-M', quantity: 1 }]))
      .rejects.toMatchObject({ status: 503, code: 'G6_INVENTORY_UNDETERMINED' });
  });

  it('does not make a provider request unless every explicit gate and the contract pin match', async () => {
    values.CHECKOUT_G6_QUANTITY_APPROVED = 'false';
    await expect(provider.verifyQuantities([{ sku: 'ADI-ENT22-AZU-M', quantity: 1 }]))
      .rejects.toMatchObject({ status: 503, code: 'G6_CHECKOUT_INTEGRATION_DISABLED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
