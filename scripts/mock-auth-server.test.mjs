import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { startMockAuthServer } from './mock-auth-server.mjs';

function decode(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

test('serves a loopback JWKS and a signed access token accepted by the auth guard contract', async () => {
  const mockAuth = await startMockAuthServer({ port: 0 });
  try {
    const jwksResponse = await fetch(`${mockAuth.issuer}/jwks`);
    assert.equal(jwksResponse.status, 200);
    const jwks = await jwksResponse.json();
    const [jwk] = jwks.keys;
    assert.equal(jwk.alg, 'RS256');
    assert.equal(jwk.use, 'sig');

    const tokenResponse = await fetch(`${mockAuth.issuer}/token?user=default`);
    assert.equal(tokenResponse.status, 200);
    const body = await tokenResponse.json();
    assert.equal(body.token_type, 'Bearer');
    assert.equal(body.expires_in, 900);

    const [encodedHeader, encodedClaims, encodedSignature] = body.access_token.split('.');
    const header = decode(encodedHeader);
    const claims = decode(encodedClaims);
    assert.equal(header.alg, 'RS256');
    assert.equal(header.kid, jwk.kid);
    assert.equal(claims.iss, mockAuth.issuer);
    assert.equal(claims.sub, '11111111-1111-4111-8111-111111111111');
    assert.equal(claims.tipo, 'acceso');
    assert.ok(claims.exp > Math.floor(Date.now() / 1000));

    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    assert.equal(
      verify(
        'RSA-SHA256',
        Buffer.from(`${encodedHeader}.${encodedClaims}`),
        publicKey,
        Buffer.from(encodedSignature, 'base64url'),
      ),
      true,
    );
  } finally {
    await mockAuth.close();
  }
});

test('limits token issuance to the documented mock identities', async () => {
  const mockAuth = await startMockAuthServer({ port: 0 });
  try {
    const response = await fetch(`${mockAuth.issuer}/token?user=unknown`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: { code: 'UNKNOWN_MOCK_USER', allowed: ['default', 'empty'] },
    });
  } finally {
    await mockAuth.close();
  }
});

test('rejects requests with a non-loopback Host header', async () => {
  const mockAuth = await startMockAuthServer({ port: 0 });
  try {
    const response = await new Promise((resolve, reject) => {
      const request = httpRequest(
        `${mockAuth.issuer}/token?user=default`,
        {
          headers: { Host: 'attacker.example' },
        },
        (incoming) => {
          let body = '';
          incoming.setEncoding('utf8');
          incoming.on('data', (chunk) => {
            body += chunk;
          });
          incoming.on('end', () => resolve({ status: incoming.statusCode, body }));
        },
      );
      request.on('error', reject);
      request.end();
    });
    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.body), {
      error: { code: 'MOCK_AUTH_HOST_REJECTED' },
    });
  } finally {
    await mockAuth.close();
  }
});

test('refuses to start when production or external-auth mode is configured', async () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldUseMocks = process.env.USE_MOCKS;
  try {
    process.env.NODE_ENV = 'production';
    process.env.USE_MOCKS = 'true';
    await assert.rejects(startMockAuthServer({ port: 0 }), /requires non-production/);

    process.env.NODE_ENV = 'development';
    process.env.USE_MOCKS = 'false';
    await assert.rejects(startMockAuthServer({ port: 0 }), /requires non-production/);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldUseMocks === undefined) delete process.env.USE_MOCKS;
    else process.env.USE_MOCKS = oldUseMocks;
  }
});
