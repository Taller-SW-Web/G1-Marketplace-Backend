import { createServer } from 'node:http';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';

const HOST = '127.0.0.1';
const DEFAULT_SUBJECT = '11111111-1111-4111-8111-111111111111';
const EMPTY_SUBJECT = '22222222-2222-4222-8222-222222222222';
const TOKEN_TTL_SECONDS = 15 * 60;

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export async function startMockAuthServer({ port = 4010 } = {}) {
  const nodeEnv = String(process.env.NODE_ENV ?? 'development').toLowerCase();
  const useMocks = String(process.env.USE_MOCKS ?? 'true').toLowerCase();
  if (nodeEnv === 'production' || useMocks !== 'true') {
    throw new Error('The local mock auth issuer requires non-production USE_MOCKS=true');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Mock auth port must be an integer between 0 and 65535');
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = `local-mock-${randomUUID()}`;
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid,
    use: 'sig',
    alg: 'RS256',
  };
  let issuer;
  let expectedHost;

  const server = createServer((request, response) => {
    if (request.headers.host !== expectedHost) {
      json(response, 403, { error: { code: 'MOCK_AUTH_HOST_REJECTED' } });
      return;
    }
    const requestUrl = new URL(request.url ?? '/', `http://${HOST}`);
    if (request.method !== 'GET') {
      json(response, 405, { error: { code: 'METHOD_NOT_ALLOWED' } });
      return;
    }

    if (requestUrl.pathname === '/jwks') {
      json(response, 200, { keys: [jwk] });
      return;
    }

    if (requestUrl.pathname === '/token') {
      const user = requestUrl.searchParams.get('user');
      const subject =
        user === 'default'
          ? DEFAULT_SUBJECT
          : user === 'empty'
            ? EMPTY_SUBJECT
            : undefined;
      if (!subject) {
        json(response, 400, {
          error: { code: 'UNKNOWN_MOCK_USER', allowed: ['default', 'empty'] },
        });
        return;
      }

      const issuedAt = Math.floor(Date.now() / 1000);
      const header = encode({ alg: 'RS256', typ: 'JWT', kid });
      const claims = encode({
        iss: issuer,
        sub: subject,
        tipo: 'acceso',
        iat: issuedAt,
        exp: issuedAt + TOKEN_TTL_SECONDS,
      });
      const signingInput = `${header}.${claims}`;
      const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString(
        'base64url',
      );
      json(response, 200, {
        access_token: `${signingInput}.${signature}`,
        token_type: 'Bearer',
        expires_in: TOKEN_TTL_SECONDS,
      });
      return;
    }

    json(response, 404, { error: { code: 'NOT_FOUND' } });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to determine local mock auth port');
  }
  expectedHost = `${HOST}:${address.port}`;
  issuer = `http://${HOST}:${address.port}`;

  return {
    server,
    issuer,
    host: HOST,
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

if (process.argv[1] && process.argv[1].endsWith('mock-auth-server.mjs')) {
  try {
    const mockAuth = await startMockAuthServer({
      port: Number(process.env.MOCK_AUTH_PORT ?? 4010),
    });
    console.log(`Local mock auth issuer listening at ${mockAuth.issuer}`);
    console.log(`JWKS: ${mockAuth.issuer}/jwks`);
    console.log(`Fixture token: ${mockAuth.issuer}/token?user=default`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to start mock auth issuer');
    process.exitCode = 1;
  }
}
