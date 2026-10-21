import { validateEnvironment } from './environment';
import { validateTestDatabase } from '../../scripts/test-database';

describe('Environment boundaries', () => {
  const base = { DATABASE_URL: 'postgresql://localhost/development', NODE_ENV: 'test' };
  it('keeps sandbox off by default and supports existing CORS variable', () => {
    expect(validateEnvironment({ ...base, CORS_ORIGINS: 'http://localhost:3000' }))
      .toMatchObject({ H3_SANDBOX_ENABLED: false, CORS_ORIGINS: ['http://localhost:3000'] });
  });
  it.each(['production', '', undefined])('rejects sandbox for NODE_ENV=%s', (environment) => {
    expect(() => validateEnvironment({ ...base, NODE_ENV: environment, H3_SANDBOX_ENABLED: 'true', H3_JWT_SECRET: 'x'.repeat(32) })).toThrow();
  });
  it.each(['*', 'https://example.com/path', 'file:///test'])('rejects invalid origin %s', (origin) => {
    expect(() => validateEnvironment({ ...base, CORS_ALLOWED_ORIGINS: origin })).toThrow();
  });
  it('normalizes cart mocks and preserves authentication settings', () => {
    expect(validateEnvironment({ ...base, USE_MOCKS: 'FALSE', AUTH_ISSUER: 'https://auth.example',
      AUTH_JWKS_URL: 'https://auth.example/jwks', HTTP_TIMEOUT_MS: '1500' })).toMatchObject({
      USE_MOCKS: false, AUTH_ISSUER: 'https://auth.example',
      AUTH_JWKS_URL: 'https://auth.example/jwks', HTTP_TIMEOUT_MS: 1500,
    });
    expect(validateEnvironment(base)).toMatchObject({ USE_MOCKS: false,
      AUTH_ISSUER: 'http://127.0.0.1:4010', AUTH_JWKS_URL: 'http://127.0.0.1:4010/jwks' });
  });
  it('requires an adequate sandbox secret', () => {
    expect(() => validateEnvironment({ ...base, H3_SANDBOX_ENABLED: 'true', H3_JWT_SECRET: 'short' })).toThrow();
  });
  it('preserves develop production mock restrictions and requires explicit production auth', () => {
    expect(() => validateEnvironment({ ...base, NODE_ENV: 'production', USE_MOCKS: 'true' })).toThrow();
    expect(() => validateEnvironment({ ...base, NODE_ENV: 'production', ORDERS_SOURCE: 'mock' })).toThrow();
    expect(validateEnvironment({ ...base, NODE_ENV: 'production' })).toMatchObject({
      USE_MOCKS: false, ORDERS_SOURCE: 'unconfigured', AUTH_ISSUER: '', AUTH_JWKS_URL: '',
    });
  });
  it('rejects invalid mock switches, order source and HTTP timeouts', () => {
    expect(() => validateEnvironment({ ...base, USE_MOCKS: 'maybe' })).toThrow();
    expect(() => validateEnvironment({ ...base, ORDERS_SOURCE: 'unknown' })).toThrow();
    for (const timeout of ['abc', 0, 1.5, 30001]) {
      expect(() => validateEnvironment({ ...base, HTTP_TIMEOUT_MS: timeout })).toThrow();
    }
  });
  it.each([undefined, 'postgresql://remote/marketplace_h3_test', 'postgresql://localhost/development',
    'postgresql://localhost/marketplace_h3_test?schema=other'])('rejects unsafe test database %s', (url) => {
    expect(() => validateTestDatabase({ TEST_DATABASE_URL: url })).toThrow();
  });
  it('rejects development database aliases even with different credentials', () => {
    expect(() => validateTestDatabase({
      TEST_DATABASE_URL: 'postgresql://a@127.0.0.1:55432/marketplace_h3_test',
      DATABASE_URL: 'postgresql://b@localhost:55432/marketplace_h3_test',
    })).toThrow();
  });
  it('accepts the dedicated local database', () => {
    const url = 'postgresql://localhost:55432/marketplace_h3_test';
    expect(validateTestDatabase({ TEST_DATABASE_URL: url, DATABASE_URL: base.DATABASE_URL })).toBe(url);
  });
  const g7 = { ...base, AUTH_ENABLED: 'true', G7_API_URL: 'https://g7.example/api/v1',
    G1_WEB_ORIGIN: 'https://g1.example', AUTH_SESSION_KEY: Buffer.alloc(32, 1).toString('base64') };
  it('derives G7 issuer and JWKS without inheriting the local mock issuer', () => {
    expect(validateEnvironment(g7)).toMatchObject({ AUTH_ENABLED: 'true',
      AUTH_ISSUER: 'https://g7.example/api/v1/auth', AUTH_JWKS_URL: 'https://g7.example/api/v1/auth/.well-known/jwks.json' });
  });
  it('requires a private encryption key and explicit web origin for sessions', () => {
    expect(() => validateEnvironment({ ...g7, AUTH_SESSION_KEY: '' })).toThrow();
    expect(() => validateEnvironment({ ...g7, G1_WEB_ORIGIN: 'https://g1.example/path' })).toThrow();
    expect(() => validateEnvironment({ ...g7, HTTP_TIMEOUT_MS: '30000' })).toThrow();
  });
  it('rejects mixing real G7 sessions with mock identity', () => {
    expect(() => validateEnvironment({ ...g7, H3_AUTH_MOCK: 'true' })).toThrow();
    expect(() => validateEnvironment({ ...g7, H3_SANDBOX_ENABLED: 'true', H3_JWT_SECRET: 'x'.repeat(32) })).toThrow();
  });
  it('requires HTTPS for production web and provider endpoints', () => {
    expect(() => validateEnvironment({ ...g7, NODE_ENV: 'production', G7_API_URL: 'http://localhost:4012/api/v1' })).toThrow();
    expect(() => validateEnvironment({ ...g7, NODE_ENV: 'production', G1_WEB_ORIGIN: 'http://127.0.0.1:3000' })).toThrow();
  });
});
