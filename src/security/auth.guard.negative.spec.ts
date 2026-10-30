import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync, sign } from 'node:crypto';
import { AuthGuard } from './auth.guard';

// Local keys and a mocked JWKS fetch: negative JWT cases only, not G7 evidence.
describe('AuthGuard negative JWT cases (local keys, mocked JWKS)', () => {
  const issuer = 'https://security.example.test';
  const subject = '11111111-1111-4111-8111-111111111111';
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' };
  const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = () => Math.floor(Date.now() / 1000);
  const valid = () => ({ iss: issuer, sub: subject, tipo: 'acceso', exp: now() + 60 });
  const rs = (claims: Record<string, unknown>, header: Record<string, unknown> = {}, key = pair.privateKey) => {
    const input = `${b64({ alg: 'RS256', kid: 'k1', ...header })}.${b64(claims)}`;
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), key).toString('base64url')}`;
  };
  const make = (env: Record<string, unknown> = {}) => new AuthGuard({
    get: (key: string, fallback?: unknown) => ({ AUTH_ISSUER: issuer, AUTH_JWKS_URL: 'https://security.example.test/jwks', ...env } as Record<string, unknown>)[key] ?? fallback,
  } as unknown as ConfigService);

  beforeEach(() => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ keys: [jwk] }) } as Response);
  });
  afterEach(() => jest.restoreAllMocks());

  it('accepts the baseline token (control)', async () => {
    await expect(make().authenticate(rs(valid()))).resolves.toEqual({ sub: subject });
  });

  const rejected: Array<[string, () => string]> = [
    ['alg none', () => `${b64({ alg: 'none', typ: 'JWT' })}.${b64(valid())}.`],
    ['alg none with a signature part', () => `${b64({ alg: 'none' })}.${b64(valid())}.AAAA`],
    ['unsupported algorithm', () => `${b64({ alg: 'ES256', kid: 'k1' })}.${b64(valid())}.AAAA`],
    ['signature from a different key', () => rs(valid(), {}, other.privateKey)],
    ['tampered payload with the original signature', () => {
      const [h, , s] = rs(valid()).split('.');
      return `${h}.${b64({ ...valid(), sub: '22222222-2222-4222-8222-222222222222' })}.${s}`;
    }],
    ['wrong issuer', () => rs({ ...valid(), iss: 'https://evil.example.test' })],
    ['missing issuer', () => rs({ ...valid(), iss: undefined })],
    ['expired', () => rs({ ...valid(), exp: now() - 1 })],
    ['exp as string', () => rs({ ...valid(), exp: String(now() + 60) })],
    ['missing exp', () => rs({ ...valid(), exp: undefined })],
    ['not yet valid (nbf)', () => rs({ ...valid(), nbf: now() + 600 })],
    ['refresh token type', () => rs({ ...valid(), tipo: 'refresh' })],
    ['non-UUID subject', () => rs({ ...valid(), sub: 'admin' })],
    ['missing kid', () => `${b64({ alg: 'RS256' })}.${b64(valid())}.AAAA`],
    ['unknown kid', () => rs(valid(), { kid: 'unknown' })],
    ['malformed (two parts)', () => 'a.b'],
    ['empty segment', () => `${b64({ alg: 'RS256', kid: 'k1' })}..AAAA`],
    ['garbage', () => 'not-a-jwt'],
    ['oversized', () => 'a'.repeat(8193)],
  ];
  it.each(rejected)('rejects %s with a generic 401', async (_name, token) => {
    const error = await make().authenticate(token()).catch((e) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toEqual({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('rejects HS256 sandbox tokens unless sandbox is enabled in a development/test environment', async () => {
    const hs = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(valid())}.AAAA`;
    await expect(make({ NODE_ENV: 'production', H3_SANDBOX_ENABLED: true }).authenticate(hs)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(make({ NODE_ENV: 'test', H3_SANDBOX_ENABLED: false }).authenticate(hs)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('never accepts HS256 once G7 introspection is enabled', async () => {
    const hs = `${b64({ alg: 'HS256' })}.${b64(valid())}.AAAA`;
    await expect(make({ G7_INTROSPECTION_ENABLED: 'true', H3_SANDBOX_ENABLED: true, NODE_ENV: 'test', H3_JWT_SECRET: 'x'.repeat(40) })
      .authenticate(hs)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('fails closed with 503 when the JWKS endpoint is unreachable', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('timeout'));
    await expect(make().authenticate(rs(valid()))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('fails closed with 503 on an invalid JWKS body or non-OK response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
    await expect(make().authenticate(rs(valid()))).rejects.toBeInstanceOf(ServiceUnavailableException);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ nokeys: true }) } as Response);
    await expect(make().authenticate(rs(valid()))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('refuses RS256 when issuer/JWKS configuration is missing', async () => {
    await expect(make({ AUTH_ISSUER: '', AUTH_JWKS_URL: '' }).authenticate(rs(valid()))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('requires the bearer scheme and a single token in the Authorization header', async () => {
    const guard = make();
    const ctx = (authorization?: string) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) }) as never;
    await expect(guard.canActivate(ctx())).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx('Basic abc'))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(ctx(`Bearer ${rs(valid())} extra`))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
