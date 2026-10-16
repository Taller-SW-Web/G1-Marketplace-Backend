import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'node:crypto';
import { AuthGuard } from './auth.guard';
import { AuthenticatedRequest } from './auth.types';

describe('AuthGuard', () => {
  const issuer = 'https://security.example.test';
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig' };
  let guard: AuthGuard;

  const makeToken = (claims: Record<string, unknown>) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString(
      'base64url',
    );
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signingInput = `${header}.${payload}`;
    return `${signingInput}.${sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url')}`;
  };

  const makeContext = (token: string) => {
    const request: AuthenticatedRequest = { headers: { authorization: `Bearer ${token}` } };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };

  beforeEach(() => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    } as Response);
    const config = {
      get: (key: string, fallback?: unknown) =>
        ({ AUTH_ISSUER: issuer, AUTH_JWKS_URL: 'https://security.example.test/jwks' })[key] ??
        fallback,
    } as unknown as ConfigService;
    guard = new AuthGuard(config);
  });

  afterEach(() => jest.restoreAllMocks());

  it('verifies RS256, issuer, access-token type and UUID subject without requiring aud', async () => {
    const subject = '11111111-1111-4111-8111-111111111111';
    const { token } = {
      token: makeToken({
        iss: issuer,
        sub: subject,
        tipo: 'acceso',
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    };
    const { context, request } = makeContext(token);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: subject });
  });

  it('rejects expired tokens and tokens with a non-access type', async () => {
    const expired = makeToken({
      iss: issuer,
      sub: '11111111-1111-4111-8111-111111111111',
      tipo: 'acceso',
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    const wrongType = makeToken({
      iss: issuer,
      sub: '11111111-1111-4111-8111-111111111111',
      tipo: 'refresh',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    await expect(guard.canActivate(makeContext(expired).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(guard.canActivate(makeContext(wrongType).context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
