import * as http from 'node:http';
import { once } from 'node:events';
import {
  createClientCredentialsTokenProvider,
  SERVICE_CLIENT_ID,
  SERVICE_SCOPE,
} from './client-credentials-token';
import type { CatalogFetch } from './types';
import { catalogTestJwt } from '../../test/fixtures/g7-catalog-jwt';

const tokenUrl = new URL('https://g7.example/api/v1/auth/token');
const tokenResponse = (accessToken: string, expiresIn = 3600) => Response.json({
  accessToken,
  tokenType: 'Bearer',
  expiresIn,
  scopes: [SERVICE_SCOPE],
});

function makeTokenProvider(fetchImpl: CatalogFetch, now?: () => number, scopes?: readonly string[]) {
  return createClientCredentialsTokenProvider({
    tokenUrl,
    clientSecret: 'synthetic-test-secret',
    timeoutMs: 1000,
    fetchImpl,
    now,
    requestedScopes: scopes,
  });
}

test('requests a catalog token via the implicit grant without scope or audience parameters', async () => {
  let seenUrl: URL | undefined;
  let seenOptions: RequestInit | undefined;
  const provider = makeTokenProvider(async (url, options) => {
    seenUrl = url;
    seenOptions = options;
    return tokenResponse(catalogTestJwt());
  });

  await expect(provider.getAccessToken()).resolves.toBe(catalogTestJwt());

  expect(seenUrl?.href).toBe(tokenUrl.href);
  expect(seenOptions?.method).toBe('POST');
  expect(new Headers(seenOptions?.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded');
  const form = new URLSearchParams(String(seenOptions?.body));
  expect(Object.fromEntries(form)).toEqual({
    grant_type: 'client_credentials',
    client_id: SERVICE_CLIENT_ID,
    client_secret: 'synthetic-test-secret',
  });
});

test('requests and verifies every configured commerce scope', async () => {
  const scopes = ['precios:leer', 'inventario:disponibilidad:leer'];
  let form: URLSearchParams | undefined;
  const provider = makeTokenProvider(async (_url, options) => {
    form = new URLSearchParams(String(options.body));
    return Response.json({ accessToken: 'commerce-token', tokenType: 'Bearer', expiresIn: 3600, scopes });
  }, undefined, scopes);

  await expect(provider.getAccessToken()).resolves.toBe('commerce-token');
  expect(form?.get('scope')).toBe('precios:leer inventario:disponibilidad:leer');

  const incomplete = makeTokenProvider(async () => Response.json({
    accessToken: 'incomplete-token', tokenType: 'Bearer', expiresIn: 3600, scopes: ['precios:leer'],
  }), undefined, scopes);
  await expect(incomplete.getAccessToken()).rejects.toMatchObject({ diagnostic: 'G7_TOKEN_INVALID_RESPONSE' });
});

test('uses one in-flight token request for concurrent callers', async () => {
  let resolveResponse!: (response: Response) => void;
  const responsePromise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
  let calls = 0;
  const provider = makeTokenProvider(async () => {
    calls += 1;
    return responsePromise;
  });

  const first = provider.getAccessToken();
  const second = provider.getAccessToken();
  const third = provider.getAccessToken();
  expect(calls).toBe(1);
  const token = catalogTestJwt({}, 'single-flight');
  resolveResponse(tokenResponse(token));
  await expect(Promise.all([first, second, third])).resolves.toEqual([
    token, token, token,
  ]);
  expect(calls).toBe(1);
});

test('reuses a cached token and renews it before expiration', async () => {
  let currentTime = 0;
  let calls = 0;
  const provider = makeTokenProvider(async () => {
    calls += 1;
    return tokenResponse(catalogTestJwt({}, String(calls)));
  }, () => currentTime);

  await expect(provider.getAccessToken()).resolves.toBe(catalogTestJwt({}, '1'));
  currentTime = 3_539_999;
  await expect(provider.getAccessToken()).resolves.toBe(catalogTestJwt({}, '1'));
  expect(calls).toBe(1);

  currentTime = 3_540_000;
  await expect(provider.getAccessToken()).resolves.toBe(catalogTestJwt({}, '2'));
  expect(calls).toBe(2);
});

test('serves only the still-valid cached token during a brief renewal failure', async () => {
  let currentTime = 0;
  let calls = 0;
  const provider = makeTokenProvider(async () => {
    calls += 1;
    if (calls === 1) return tokenResponse(catalogTestJwt());
    throw new Error('transport failed with synthetic-test-secret');
  }, () => currentTime);

  await expect(provider.getAccessToken()).resolves.toBe(catalogTestJwt());
  currentTime = 3_540_000;
  await expect(provider.getAccessToken()).resolves.toBe(catalogTestJwt());
  expect(calls).toBe(2);

  currentTime = 3_600_000;
  let failure: unknown;
  try { await provider.getAccessToken(); }
  catch (error) { failure = error; }
  expect(failure).toMatchObject({
    code: 'CATALOG_UNAVAILABLE', diagnostic: 'G7_TOKEN_UNAVAILABLE', status: 503,
  });
  expect(String(failure)).not.toContain('synthetic-test-secret');
  await expect(provider.getAccessToken()).rejects.toMatchObject({ diagnostic: 'G7_TOKEN_UNAVAILABLE' });
  expect(calls).toBe(3);
});

test('rejects a token without the required granted scope and sanitizes issuer failures', async () => {
  const missingScope = makeTokenProvider(async () => Response.json({
    accessToken: catalogTestJwt(),
    tokenType: 'Bearer',
    expiresIn: 3600,
    scopes: ['usuarios:leer'],
  }));
  await expect(missingScope.getAccessToken()).rejects.toMatchObject({
    diagnostic: 'G7_TOKEN_INVALID_RESPONSE',
    status: 503,
  });

  const rejected = makeTokenProvider(async () => new Response(
    JSON.stringify({ detail: 'synthetic-test-secret must not escape' }), { status: 401 },
  ));
  await expect(rejected.getAccessToken()).rejects.toMatchObject({
    diagnostic: 'G7_TOKEN_REJECTED',
    status: 503,
  });
});

test.each([
  ['different audience', catalogTestJwt({ aud: 'api-ventas' })],
  ['space-separated audiences instead of an array', catalogTestJwt({ aud: 'api-ventas api-productos' })],
  ['missing audience', catalogTestJwt({ aud: null })],
  ['missing JWT scope despite the response scopes', catalogTestJwt({ scope: 'ventas:pedidos:crear' })],
  ['opaque or malformed token', 'opaque-test-token'],
])('rejects and does not cache a catalog token with %s', async (_name, token) => {
  let now = 0;
  const fetcher = jest.fn<ReturnType<CatalogFetch>, Parameters<CatalogFetch>>().mockImplementationOnce(async () => tokenResponse(token))
    .mockImplementationOnce(async () => tokenResponse(catalogTestJwt()));
  const provider = makeTokenProvider(fetcher, () => now);
  await expect(provider.getAccessToken()).rejects.toMatchObject({ diagnostic: 'G7_TOKEN_INVALID_RESPONSE', status: 503 });
  now = 5000;
  await expect(provider.getAccessToken()).resolves.toBe(catalogTestJwt());
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('accepts the catalog grant with an audience array and scopes claim', async () => {
  const token = catalogTestJwt({ aud: ['api-productos', 'other'], scope: undefined, scopes: [SERVICE_SCOPE] });
  await expect(makeTokenProvider(async () => tokenResponse(token)).getAccessToken()).resolves.toBe(token);
});

test('sends a real HTTP request to a local fake G7 without logging or persisting credentials', async () => {
  let requestDetails: { method?: string; path?: string; contentType?: string; form?: URLSearchParams } | undefined;
  const fakeG7 = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      requestDetails = {
        method: request.method,
        path: request.url,
        contentType: request.headers['content-type'],
        form,
      };
      if (form.has('scope') || form.has('aud') || form.has('audience')) {
        response.writeHead(400).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        accessToken: catalogTestJwt(),
        tokenType: 'Bearer',
        expiresIn: 3600,
        scopes: [SERVICE_SCOPE],
      }));
    });
  });
  fakeG7.listen(0, '127.0.0.1');
  await once(fakeG7, 'listening');
  const address = fakeG7.address();
  expect(address && typeof address !== 'string').toBe(true);
  if (!address || typeof address === 'string') throw new Error('Missing fake G7 port');

  const provider = createClientCredentialsTokenProvider({
    tokenUrl: new URL(`http://127.0.0.1:${address.port}/api/v1/auth/token`),
    clientSecret: 'local-only-synthetic-secret',
    timeoutMs: 1000,
    fetchImpl: fetch,
  });

  try {
    await expect(provider.getAccessToken()).resolves.toBe(catalogTestJwt());
    expect(requestDetails?.method).toBe('POST');
    expect(requestDetails?.path).toBe('/api/v1/auth/token');
    expect(requestDetails?.contentType).toContain('application/x-www-form-urlencoded');
    expect(requestDetails?.form?.get('client_id')).toBe(SERVICE_CLIENT_ID);
    expect(requestDetails?.form?.get('client_secret')).toBe('local-only-synthetic-secret');
    expect(requestDetails?.form?.has('scope')).toBe(false);
    expect(requestDetails?.form?.has('aud')).toBe(false);
  } finally {
    fakeG7.closeAllConnections();
    await new Promise<void>((resolve) => fakeG7.close(() => resolve()));
  }
});
