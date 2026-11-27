import { validateEnvironment } from './environment';
import { validateTestDatabase } from '../../scripts/test-database';

describe('Environment boundaries', () => {
  const base = { DATABASE_URL: 'postgresql://localhost/development', NODE_ENV: 'test' };
  it('rejects invalid integration flags and mixed real providers/sandbox identity', () => {
    for (const key of ['WISHLIST_G6_APPROVED', 'WISHLIST_G6_QUANTITY_APPROVED', 'CSAT_ENABLED', 'CSAT_INTEGRATION_APPROVED', 'CSAT_PROMPT_APPROVED']) {
      expect(() => validateEnvironment({ ...base, [key]: 'yes' })).toThrow();
    }
    expect(() => validateEnvironment({ ...base, WISHLIST_SOURCE: 'other' })).toThrow();
    const sandbox = { ...base, H3_SANDBOX_ENABLED: 'true', H3_JWT_SECRET: 'synthetic-test-only-'.repeat(3) };
    expect(() => validateEnvironment({ ...sandbox, WISHLIST_SOURCE: 'real' })).toThrow();
    expect(() => validateEnvironment({ ...sandbox, CSAT_ENABLED: 'true' })).toThrow();
  });
  it('keeps sandbox off by default and supports existing CORS variable', () => {
    expect(validateEnvironment({ ...base, CORS_ORIGINS: 'http://localhost:3000' }))
      .toMatchObject({ H3_SANDBOX_ENABLED: false, CORS_ORIGINS: ['http://localhost:3000'],
        CHECKOUT_SALES_SOURCE: 'mock', G5_SALES_INTEGRATION_APPROVED: 'false', G5_CONTRACT_PRODUCT_FALLBACK_ENABLED: 'false' });
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
  it('keeps the RabbitMQ consumer disabled by default and requires a private URL when enabled', () => {
    expect(validateEnvironment(base)).toMatchObject({
      SECURITY_EVENTS_ENABLED: false,
      SECURITY_EVENTS_PREFETCH: 1,
      SECURITY_EVENTS_MAX_RETRIES: 3,
      SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
      SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
    });
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_ENABLED: 'true' })).toThrow(
      'RABBITMQ_URL is required when SECURITY_EVENTS_ENABLED=true',
    );
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_ENABLED: 'true',
      RABBITMQ_URL: 'amqps://user:secret@broker.example/vhost' })).toThrow(
      'SECURITY_EVENTS_MAX_RETRIES must be explicitly configured when SECURITY_EVENTS_ENABLED=true',
    );
  });
  it('validates RabbitMQ transport security and bounded consumer prefetch', () => {
    expect(validateEnvironment({ ...base, SECURITY_EVENTS_ENABLED: 'true',
      RABBITMQ_URL: 'amqps://user:secret@broker.example/vhost',
      SECURITY_EVENTS_MAX_RETRIES: '3',
      SECURITY_EVENTS_BACKOFF_BASE_MS: '1000',
      SECURITY_EVENTS_BACKOFF_MAX_MS: '30000' }))
      .toMatchObject({ SECURITY_EVENTS_ENABLED: true });
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_ENABLED: 'true',
      RABBITMQ_URL: 'amqps://user:secret@broker.example/vhost' })).toThrow(
      'SECURITY_EVENTS_MAX_RETRIES must be explicitly configured when SECURITY_EVENTS_ENABLED=true',
    );
    expect(() => validateEnvironment({ ...base, NODE_ENV: 'production', SECURITY_EVENTS_ENABLED: 'true',
      RABBITMQ_URL: 'amqp://user:secret@broker.example/vhost',
      SECURITY_EVENTS_MAX_RETRIES: '3',
      SECURITY_EVENTS_BACKOFF_BASE_MS: '1000',
      SECURITY_EVENTS_BACKOFF_MAX_MS: '30000' })).toThrow('must use TLS');
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_PREFETCH: '0' })).toThrow();
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_MAX_RETRIES: '0' })).toThrow();
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_BACKOFF_BASE_MS: '0' })).toThrow();
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_BACKOFF_MAX_MS: '999' })).toThrow();
  });
  it('normalizes bounded RabbitMQ retry and backoff settings', () => {
    expect(validateEnvironment(base)).toMatchObject({
      SECURITY_EVENTS_MAX_RETRIES: 3,
      SECURITY_EVENTS_BACKOFF_BASE_MS: 1000,
      SECURITY_EVENTS_BACKOFF_MAX_MS: 30000,
    });
    expect(validateEnvironment({ ...base, SECURITY_EVENTS_MAX_RETRIES: '4',
      SECURITY_EVENTS_BACKOFF_BASE_MS: '500', SECURITY_EVENTS_BACKOFF_MAX_MS: '8000' }))
      .toMatchObject({ SECURITY_EVENTS_MAX_RETRIES: 4, SECURITY_EVENTS_BACKOFF_BASE_MS: 500,
        SECURITY_EVENTS_BACKOFF_MAX_MS: 8000 });
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_MAX_RETRIES: '0' })).toThrow();
    expect(() => validateEnvironment({ ...base, SECURITY_EVENTS_BACKOFF_MAX_MS: '500' })).toThrow();
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
  it('validates independent checkout timeouts without relaxing the G7 user-session limit', () => {
    expect(validateEnvironment(g7)).toMatchObject({ G5_SALES_TIMEOUT_MS: 30_000, G7_SERVICE_TOKEN_TIMEOUT_MS: 15_000 });
    expect(validateEnvironment({ ...g7, HTTP_TIMEOUT_MS: '5000', G5_SALES_TIMEOUT_MS: '60000', G7_SERVICE_TOKEN_TIMEOUT_MS: '25000' }))
      .toMatchObject({ HTTP_TIMEOUT_MS: 5_000, G5_SALES_TIMEOUT_MS: 60_000, G7_SERVICE_TOKEN_TIMEOUT_MS: 25_000 });
    expect(() => validateEnvironment({ ...g7, G5_SALES_TIMEOUT_MS: '60001' })).toThrow(/G5_SALES_TIMEOUT_MS/);
    expect(() => validateEnvironment({ ...g7, G7_SERVICE_TOKEN_TIMEOUT_MS: '10.5' })).toThrow(/G7_SERVICE_TOKEN_TIMEOUT_MS/);
    expect(() => validateEnvironment({ ...g7, HTTP_TIMEOUT_MS: '5800', G5_SALES_TIMEOUT_MS: '30000' })).toThrow(/G7 session flow/);
  });
  it('enables G5 checkout only with G7 service credentials, live auth, G7 addresses and explicit approval', () => {
    const g5 = {
      ...g7,
      USE_MOCKS: 'false',
      CHECKOUT_ADDRESS_SOURCE: 'g7',
      CHECKOUT_SALES_SOURCE: 'g5',
      G5_SALES_INTEGRATION_APPROVED: 'true',
      G7_SERVICE_CLIENT_ID: 'modulo-marketplace',
      G7_SERVICE_CLIENT_SECRET: 'synthetic-only-service-secret-value-123456',
      VENTAS_BASE_URL: 'https://g5-api-gateway.example',
    };
    expect(validateEnvironment(g5)).toMatchObject({ CHECKOUT_SALES_SOURCE: 'g5', G5_SALES_INTEGRATION_APPROVED: 'true' });
    expect(() => validateEnvironment({ ...g5, USE_MOCKS: 'true' })).toThrow();
    expect(() => validateEnvironment({ ...g5, G5_SALES_INTEGRATION_APPROVED: 'false' })).toThrow();
    expect(() => validateEnvironment({ ...g5, CHECKOUT_ADDRESS_SOURCE: 'fixture' })).toThrow();
    expect(() => validateEnvironment({ ...g5, G7_SERVICE_CLIENT_SECRET: '' })).toThrow();
    expect(() => validateEnvironment({ ...g5, VENTAS_BASE_URL: 'http://g5.example' })).toThrow();
    const fixture = {
      customerId: '11111111-1111-4111-8111-111111111111', sku: 'SKU-TEST', productId: 'PROD-TEST',
      unitPriceCents: 1500, shippingCents: 0, paymentMethod: 'SIMULADO', expiresAt: '2030-01-01T18:00:00.000Z',
    };
    const trial = { ...g5, NODE_ENV: 'production', CHECKOUT_G5_TEST_FIXTURE: JSON.stringify(fixture) };
    expect(validateEnvironment(trial)).toMatchObject({ USE_MOCKS: false, CHECKOUT_SALES_SOURCE: 'g5' });
    expect(() => validateEnvironment({ ...trial, USE_MOCKS: 'true' })).toThrow();
    expect(() => validateEnvironment({ ...trial, CHECKOUT_SALES_SOURCE: 'mock' })).toThrow(/CHECKOUT_G5_TEST_FIXTURE/);
    expect(() => validateEnvironment({ ...trial, G5_CONTRACT_PRODUCT_FALLBACK_ENABLED: 'true' })).toThrow(/CHECKOUT_G5_TEST_FIXTURE/);
    expect(() => validateEnvironment({ ...trial, CHECKOUT_G5_TEST_FIXTURE: JSON.stringify({ ...fixture, unitPriceCents: -1 }) }))
      .toThrow(/CHECKOUT_G5_TEST_FIXTURE/);
  });
  it('rejects mixing real G7 sessions with mock identity', () => {
    expect(() => validateEnvironment({ ...g7, H3_AUTH_MOCK: 'true' })).toThrow();
    expect(() => validateEnvironment({ ...g7, H3_SANDBOX_ENABLED: 'true', H3_JWT_SECRET: 'x'.repeat(32) })).toThrow();
  });
  it('requires HTTPS for production web and provider endpoints', () => {
    expect(() => validateEnvironment({ ...g7, NODE_ENV: 'production', G7_API_URL: 'http://localhost:4012/api/v1' })).toThrow();
    expect(() => validateEnvironment({ ...g7, NODE_ENV: 'production', G1_WEB_ORIGIN: 'http://127.0.0.1:3000' })).toThrow();
  });
  it('keeps introspection gated and requires private service credentials when enabled', () => {
    expect(validateEnvironment(g7).G7_INTROSPECTION_ENABLED).toBeUndefined();
    expect(() => validateEnvironment({ ...base, G7_INTROSPECTION_ENABLED: 'true' })).toThrow();
    expect(() => validateEnvironment({ ...g7, G7_INTROSPECTION_ENABLED: 'true' })).toThrow();
    expect(() => validateEnvironment({ ...g7, G7_INTROSPECTION_ENABLED: 'true',
      G7_SERVICE_CLIENT_ID: 'fixture-client', G7_SERVICE_CLIENT_SECRET: 'short' })).toThrow();
    expect(() => validateEnvironment({ ...g7, G7_INTROSPECTION_ENABLED: 'maybe' })).toThrow();
    expect(validateEnvironment({ ...g7, G7_INTROSPECTION_ENABLED: 'true',
      G7_SERVICE_CLIENT_ID: 'fixture-client', G7_SERVICE_CLIENT_SECRET: 'x'.repeat(43) }))
      .toMatchObject({ G7_INTROSPECTION_ENABLED: 'true' });
  });
});
