import * as http from 'node:http';
import { once } from 'node:events';
import {
  createClientCredentialsTokenProvider,
  SERVICE_CLIENT_ID,
  SERVICE_SCOPE,
} from './client-credentials-token';
import type { CatalogFetch } from './types';

const tokenUrl = new URL('https://g7.example/api/v1/auth/token');
const tokenResponse = (accessToken: string, expiresIn = 3600) => Response.json({
  accessToken,
  tokenType: 'Bearer',
  expiresIn,
  scopes: [SERVICE_SCOPE],
});

function makeTokenProvider(fetchImpl: CatalogFetch, now?: () => number) {
  return createClientCredentialsTokenProvider({
    tokenUrl,
    clientSecret: 'synthetic-test-secret',
    timeoutMs: 1000,
    fetchImpl,
    now,
  });
}

test('requests a service token from the fake G7 using form encoding and no audience parameter', async () => {
  let seenUrl: URL | undefined;
  let seenOptions: RequestInit | undefined;
  const provider = makeTokenProvider(async (url, options) => {
    seenUrl = url;
    seenOptions = options;
    return tokenResponse('synthetic-access-token');
  });

  await expect(provider.getAccessToken()).resolves.toBe('synthetic-access-token');

  expect(seenUrl?.href).toBe(tokenUrl.href);
  expect(seenOptions?.method).toBe('POST');
  expect(new Headers(seenOptions?.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded');
  const form = new URLSearchParams(String(seenOptions?.body));
  expect(Object.fromEntries(form)).toEqual({
    grant_type: 'client_credentials',
    client_id: SERVICE_CLIENT_ID,
    client_secret: 'synthetic-test-secret',
    scope: SERVICE_SCOPE,
  });
  expect(form.has('aud')).toBe(false);
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
  resolveResponse(tokenResponse('single-flight-token'));
  await expect(Promise.all([first, second, third])).resolves.toEqual([
    'single-flight-token', 'single-flight-token', 'single-flight-token',
  ]);
  expect(calls).toBe(1);
});

test('reuses a cached token and renews it before expiration', async () => {
  let currentTime = 0;
  let calls = 0;
  const provider = makeTokenProvider(async () => {
    calls += 1;
    return tokenResponse(`synthetic-token-${calls}`);
  }, () => currentTime);

  await expect(provider.getAccessToken()).resolves.toBe('synthetic-token-1');
  currentTime = 3_539_999;
  await expect(provider.getAccessToken()).resolves.toBe('synthetic-token-1');
  expect(calls).toBe(1);

  currentTime = 3_540_000;
  await expect(provider.getAccessToken()).resolves.toBe('synthetic-token-2');
  expect(calls).toBe(2);
});

test('serves only the still-valid cached token during a brief renewal failure', async () => {
  let currentTime = 0;
  let calls = 0;
  const provider = makeTokenProvider(async () => {
    calls += 1;
    if (calls === 1) return tokenResponse('still-valid-token');
    throw new Error('transport failed with synthetic-test-secret');
  }, () => currentTime);

  await expect(provider.getAccessToken()).resolves.toBe('still-valid-token');
  currentTime = 3_540_000;
  await expect(provider.getAccessToken()).resolves.toBe('still-valid-token');
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
    accessToken: 'synthetic-no-scope-token',
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

test('sends a real HTTP request to a local fake G7 without logging or persisting credentials', async () => {
  let requestDetails: { method?: string; path?: string; contentType?: string; form?: URLSearchParams } | undefined;
  const fakeG7 = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requestDetails = {
        method: request.method,
        path: request.url,
        contentType: request.headers['content-type'],
        form: new URLSearchParams(Buffer.concat(chunks).toString('utf8')),
      };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        accessToken: 'local-fake-g7-token',
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
    await expect(provider.getAccessToken()).resolves.toBe('local-fake-g7-token');
    expect(requestDetails?.method).toBe('POST');
    expect(requestDetails?.path).toBe('/api/v1/auth/token');
    expect(requestDetails?.contentType).toContain('application/x-www-form-urlencoded');
    expect(requestDetails?.form?.get('client_id')).toBe(SERVICE_CLIENT_ID);
    expect(requestDetails?.form?.get('client_secret')).toBe('local-only-synthetic-secret');
    expect(requestDetails?.form?.get('scope')).toBe(SERVICE_SCOPE);
    expect(requestDetails?.form?.has('aud')).toBe(false);
  } finally {
    fakeG7.closeAllConnections();
    await new Promise<void>((resolve) => fakeG7.close(() => resolve()));
  }
});
