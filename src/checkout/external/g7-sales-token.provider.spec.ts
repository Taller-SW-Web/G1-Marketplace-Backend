import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { G7SalesTokenProvider } from './g7-sales-token.provider';

function signedLikeToken(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `synthetic.${payload}.signature`;
}

describe('G7SalesTokenProvider - offline client_credentials contract', () => {
  let server: Server;
  let apiUrl: string;
  let calls: Array<{ path?: string; contentType?: string; form?: URLSearchParams }>;
  let tokenResponse: unknown;
  let holdResponse: ((response: import('node:http').ServerResponse) => void) | undefined;

  const token = (claims: Record<string, unknown> = {
    aud: ['api-ventas'], scope: 'ventas:pedidos:crear',
  }) => signedLikeToken(claims);

  beforeAll(async () => {
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        calls.push({
          path: request.url,
          contentType: request.headers['content-type'],
          form: new URLSearchParams(Buffer.concat(chunks).toString('utf8')),
        });
        if (holdResponse) {
          holdResponse(response);
          holdResponse = undefined;
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(tokenResponse));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    apiUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    calls = [];
    tokenResponse = { accessToken: token(), tokenType: 'Bearer', expiresIn: 120, scopes: ['ventas:pedidos:crear'] };
    holdResponse = undefined;
  });

  function provider(overrides: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
      G7_API_URL: apiUrl,
      G7_SERVICE_CLIENT_ID: 'fixture-client',
      G7_SERVICE_CLIENT_SECRET: 'synthetic-only-client-secret-1234567890',
      G5_SALES_INTEGRATION_APPROVED: 'true',
      CHECKOUT_SALES_SOURCE: 'g5',
      AUTH_ENABLED: 'true',
      USE_MOCKS: false,
      NODE_ENV: 'test',
      HTTP_TIMEOUT_MS: 1000,
      ...overrides,
    };
    const config = { get: (key: string, fallback?: unknown) => values[key] ?? fallback };
    return new G7SalesTokenProvider(config as ConfigService);
  }

  it('posts only client_id and client_secret and validates G7-granted audience and scope', async () => {
    const accessToken = await provider().getAccessToken();

    expect(accessToken).toBe(token());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      path: '/api/v1/auth/token',
      contentType: expect.stringContaining('application/x-www-form-urlencoded'),
    });
    expect(Object.fromEntries(calls[0].form!)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'fixture-client',
      client_secret: 'synthetic-only-client-secret-1234567890',
    });
    expect(calls[0].form?.has('scope')).toBe(false);
    expect(calls[0].form?.has('audience')).toBe(false);
    expect(calls[0].form?.has('aud')).toBe(false);
  });

  it('coalesces concurrent token requests', async () => {
    let release!: (response: import('node:http').ServerResponse) => void;
    holdResponse = (response) => { release = (res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tokenResponse));
    }; release(response); };
    const client = provider();
    await expect(Promise.all([client.getAccessToken(), client.getAccessToken(), client.getAccessToken()]))
      .resolves.toEqual([token(), token(), token()]);
    expect(calls).toHaveLength(1);
  });

  it.each([
    { aud: ['api-other'], scope: 'ventas:pedidos:crear' },
    { aud: ['api-ventas'], scope: 'ventas:pedidos:consultar' },
  ])('fails closed when G7 omits the required grant claims', async (claims) => {
    tokenResponse = { accessToken: token(claims), tokenType: 'Bearer', expiresIn: 120, scopes: ['ventas:pedidos:crear'] };
    await expect(provider().getAccessToken()).rejects.toMatchObject({ status: 503, code: 'SALES_AUTH_UNAVAILABLE' });
  });

  it('does not contact G7 before the G5 integration gates are enabled', async () => {
    await expect(provider({ G5_SALES_INTEGRATION_APPROVED: 'false' }).getAccessToken())
      .rejects.toMatchObject({ status: 503, code: 'SALES_AUTH_UNAVAILABLE' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a token endpoint outside the configured G7 API v1 base path', async () => {
    await expect(provider({ G7_API_URL: 'https://g7.example/wrong' }).getAccessToken())
      .rejects.toMatchObject({ status: 503, code: 'SALES_AUTH_UNAVAILABLE' });
    expect(calls).toHaveLength(0);
  });
});
