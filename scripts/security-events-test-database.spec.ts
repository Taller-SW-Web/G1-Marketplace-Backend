import { validateSecurityEventsTestDatabase } from './security-events-test-database';

const DATABASE_URL = 'postgresql://security_events_test:local-only@127.0.0.1:55433/marketplace_security_events_test?schema=public';
const BASE: NodeJS.ProcessEnv = {
  SECURITY_EVENTS_TEST_DATABASE_URL: DATABASE_URL,
  DATABASE_URL: 'postgresql://postgres:local-only@127.0.0.1:5432/marketplace_db?schema=public',
  TEST_DATABASE_URL: 'postgresql://h3_test:local-only@127.0.0.1:55432/marketplace_h3_test?schema=public',
  SECURITY_EVENTS_ENABLED: 'false',
  NODE_ENV: 'development',
};

describe('security-events isolated PostgreSQL guard', () => {
  it('accepts only the dedicated local database without printing or changing its URL', () => {
    expect(validateSecurityEventsTestDatabase(BASE)).toBe(DATABASE_URL);
  });

  it.each([
    ['missing URL', { ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: undefined }],
    ['remote host', { ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: DATABASE_URL.replace('127.0.0.1', 'db.example.test') }],
    ['unexpected port', { ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: DATABASE_URL.replace('55433', '5432') }],
    ['unexpected database', { ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: DATABASE_URL.replace('marketplace_security_events_test', 'marketplace_db') }],
    ['unexpected user', { ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: DATABASE_URL.replace('security_events_test:', 'postgres:') }],
    ['non-public schema', { ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: DATABASE_URL.replace('schema=public', 'schema=private') }],
    ['extra query parameter', { ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: `${DATABASE_URL}&sslmode=require` }],
    ['fragment', { ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: `${DATABASE_URL}#prod` }],
  ])('rejects %s', (_reason, env) => {
    expect(() => validateSecurityEventsTestDatabase(env)).toThrow();
  });

  it.each(['DATABASE_URL', 'TEST_DATABASE_URL'] as const)(
    'rejects using the same database as %s even through another loopback hostname',
    (name) => {
      expect(() => validateSecurityEventsTestDatabase({
        ...BASE,
        [name]: DATABASE_URL.replace('127.0.0.1', 'localhost'),
      })).toThrow(`must differ from ${name}`);
    },
  );

  it('allows DATABASE_URL only when explicitly set to the exact validated isolated URL', () => {
    expect(validateSecurityEventsTestDatabase({
      ...BASE,
      DATABASE_URL,
    })).toBe(DATABASE_URL);
  });

  it('refuses production and refuses migration while the consumer is enabled', () => {
    expect(() => validateSecurityEventsTestDatabase({ ...BASE, NODE_ENV: 'production' }))
      .toThrow('disabled in production');
    expect(() => validateSecurityEventsTestDatabase({ ...BASE, SECURITY_EVENTS_ENABLED: 'true' }))
      .toThrow('SECURITY_EVENTS_ENABLED=false');
  });

  it('does not include the configured URL in guard errors', () => {
    expect(() => validateSecurityEventsTestDatabase({ ...BASE, SECURITY_EVENTS_TEST_DATABASE_URL: undefined }))
      .toThrow('SECURITY_EVENTS_TEST_DATABASE_URL is required');
  });
});
