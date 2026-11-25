export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  for (const flag of ['WISHLIST_G6_APPROVED', 'WISHLIST_G6_QUANTITY_APPROVED', 'CSAT_ENABLED', 'CSAT_INTEGRATION_APPROVED', 'CSAT_PROMPT_APPROVED']) {
    if (!['true', 'false'].includes(String(config[flag] ?? 'false'))) throw new Error(`${flag} must be true or false`);
  }
  if (config.WISHLIST_SOURCE !== undefined && !['sandbox', 'real'].includes(String(config.WISHLIST_SOURCE))) {
    throw new Error('WISHLIST_SOURCE must be sandbox or real');
  }
  const port = Number(config.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (typeof config.DATABASE_URL !== 'string') throw new Error('DATABASE_URL is required');
  let database: URL;
  try { database = new URL(config.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL must be a PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || database.pathname.length < 2) {
    throw new Error('DATABASE_URL must use PostgreSQL with a host and database');
  }
  const flag = config.H3_SANDBOX_ENABLED ?? 'false';
  if (!['true', 'false'].includes(String(flag))) throw new Error('H3_SANDBOX_ENABLED must be true or false');
  const sandbox = String(flag) === 'true';
  if (sandbox && (config.WISHLIST_SOURCE === 'real' || config.CSAT_ENABLED === 'true')) {
    throw new Error('Real wishlist/CSAT cannot be combined with sandbox identity');
  }
  if (sandbox && !['development', 'test'].includes(String(config.NODE_ENV))) {
    throw new Error('H3 sandbox is only allowed in development or test');
  }
  if (sandbox && (typeof config.H3_JWT_SECRET !== 'string' || Buffer.byteLength(config.H3_JWT_SECRET) < 32)) {
    throw new Error('H3_JWT_SECRET requires at least 32 bytes');
  }
  // Keep the existing deployment variable as a compatible alias.
  const origins = String(config.CORS_ALLOWED_ORIGINS ?? config.CORS_ORIGINS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error('Invalid CORS origin'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('CORS entries must be explicit HTTP(S) origins');
    }
  }
  const nodeEnv = String(config.NODE_ENV ?? 'development').toLowerCase();
  const securityEventsEnabled = String(config.SECURITY_EVENTS_ENABLED ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(securityEventsEnabled)) {
    throw new Error('SECURITY_EVENTS_ENABLED must be true or false');
  }
  const securityEventsPrefetch = Number(config.SECURITY_EVENTS_PREFETCH ?? 1);
  if (!Number.isInteger(securityEventsPrefetch) || securityEventsPrefetch < 1 || securityEventsPrefetch > 100) {
    throw new Error('SECURITY_EVENTS_PREFETCH must be an integer between 1 and 100');
  }
  const securityEventsDlqQueue = String(config.SECURITY_EVENTS_DLQ_QUEUE ?? 'marketplace.usuarios.dlq');
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(securityEventsDlqQueue)) {
    throw new Error('SECURITY_EVENTS_DLQ_QUEUE must be a valid queue name');
  }
  const securityEventsMaxRetries = Number(config.SECURITY_EVENTS_MAX_RETRIES ?? 3);
  const securityEventsBackoffBaseMs = Number(config.SECURITY_EVENTS_BACKOFF_BASE_MS ?? 1000);
  const securityEventsBackoffMaxMs = Number(config.SECURITY_EVENTS_BACKOFF_MAX_MS ?? 30000);
  if (!Number.isInteger(securityEventsMaxRetries) || securityEventsMaxRetries < 1 || securityEventsMaxRetries > 10) {
    throw new Error('SECURITY_EVENTS_MAX_RETRIES must be an integer between 1 and 10');
  }
  if (!Number.isInteger(securityEventsBackoffBaseMs) || securityEventsBackoffBaseMs < 1
    || securityEventsBackoffBaseMs > 300000) {
    throw new Error('SECURITY_EVENTS_BACKOFF_BASE_MS must be an integer between 1 and 300000');
  }
  if (!Number.isInteger(securityEventsBackoffMaxMs) || securityEventsBackoffMaxMs < securityEventsBackoffBaseMs
    || securityEventsBackoffMaxMs > 3600000) {
    throw new Error('SECURITY_EVENTS_BACKOFF_MAX_MS must be an integer between the base delay and 3600000');
  }
  if (securityEventsEnabled === 'true') {
    let rabbitUrl: URL;
    try {
      rabbitUrl = new URL(String(config.RABBITMQ_URL ?? ''));
    } catch {
      throw new Error('RABBITMQ_URL is required when SECURITY_EVENTS_ENABLED=true');
    }
    if (!['amqp:', 'amqps:'].includes(rabbitUrl.protocol) || !rabbitUrl.hostname
      || !rabbitUrl.username || !rabbitUrl.password || rabbitUrl.search || rabbitUrl.hash) {
      throw new Error('RABBITMQ_URL must be an authenticated AMQP(S) URL without query or fragment');
    }
    if (nodeEnv === 'production' && rabbitUrl.protocol !== 'amqps:') {
      throw new Error('RABBITMQ_URL must use TLS (amqps) in production');
    }
    for (const name of [
      'SECURITY_EVENTS_DLQ_QUEUE',
      'SECURITY_EVENTS_MAX_RETRIES',
      'SECURITY_EVENTS_BACKOFF_BASE_MS',
      'SECURITY_EVENTS_BACKOFF_MAX_MS',
    ]) {
      if (config[name] === undefined || String(config[name]).trim() === '') {
        throw new Error(`${name} must be explicitly configured when SECURITY_EVENTS_ENABLED=true`);
      }
    }
  }
  const authEnabled = String(config.AUTH_ENABLED ?? 'false');
  for (const name of ['G7_REGISTRATION_ENABLED', 'G7_RECOVERY_ENABLED', 'G7_INTROSPECTION_ENABLED']) {
    if (!['true', 'false'].includes(String(config[name] ?? 'false'))) throw new Error(`${name} must be true or false`);
    if (String(config[name]) === 'true' && authEnabled !== 'true') throw new Error(`${name} requires AUTH_ENABLED=true`);
  }
  if (!['true', 'false'].includes(authEnabled)) throw new Error('AUTH_ENABLED must be true or false');
  if (String(config.G7_INTROSPECTION_ENABLED) === 'true') {
    if (typeof config.G7_SERVICE_CLIENT_ID !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(config.G7_SERVICE_CLIENT_ID)) {
      throw new Error('G7_SERVICE_CLIENT_ID is required for introspection');
    }
    if (typeof config.G7_SERVICE_CLIENT_SECRET !== 'string' || config.G7_SERVICE_CLIENT_SECRET.length < 32
      || config.G7_SERVICE_CLIENT_SECRET.length > 1024 || /[\r\n\0]/.test(config.G7_SERVICE_CLIENT_SECRET)) {
      throw new Error('G7_SERVICE_CLIENT_SECRET is required from the private secret manager');
    }
  }
  if (authEnabled === 'true') {
    if (String(config.H3_AUTH_MOCK) === 'true' || sandbox) throw new Error('G7 auth cannot be combined with mock identity');
    for (const name of ['G7_API_URL', 'G1_WEB_ORIGIN']) {
      let value: URL;
      try { value = new URL(String(config[name])); } catch { throw new Error(`${name} is required for G7 auth`); }
      if (value.username || value.password || value.search || value.hash
        || (value.protocol !== 'https:' && !(nodeEnv !== 'production' && value.protocol === 'http:'
          && ['localhost', '127.0.0.1'].includes(value.hostname)))) throw new Error(`${name} must use HTTPS (loopback allowed outside production)`);
      if (name === 'G1_WEB_ORIGIN' && value.origin !== config[name]) throw new Error('G1_WEB_ORIGIN must be an exact origin');
    }
    const key = String(config.AUTH_SESSION_KEY ?? '');
    if (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32) {
      throw new Error('AUTH_SESSION_KEY requires 32 random bytes encoded as base64');
    }
  }
  if (config.PRODUCTOS_AUTH_MODE === 'public-read-only' &&
      (config.CATALOG_SOURCE !== 'real' || config.BFF_MODE !== 'real' || config.CATALOG_INTEGRATION_APPROVED !== 'true')) {
    throw new Error('public-read-only requires explicit REAL catalog/detail and integration approval');
  }
  const useMocks = String(config.USE_MOCKS ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(useMocks)) throw new Error('USE_MOCKS must be true or false');
  if (useMocks === 'true' && nodeEnv === 'production') throw new Error('USE_MOCKS cannot be enabled in production');
  const addressSource = String(config.CHECKOUT_ADDRESS_SOURCE ?? 'fixture');
  if (!['fixture', 'prism', 'g7'].includes(addressSource)) throw new Error('Invalid CHECKOUT_ADDRESS_SOURCE');
  if (addressSource === 'prism' && useMocks !== 'true') throw new Error('Prism addresses require USE_MOCKS=true');
  if (addressSource === 'g7' && (authEnabled !== 'true' || useMocks === 'true')) {
    throw new Error('G7 addresses require AUTH_ENABLED=true and USE_MOCKS=false');
  }
  const httpTimeoutMs = Number(config.HTTP_TIMEOUT_MS ?? 3000);
  if (!Number.isInteger(httpTimeoutMs) || httpTimeoutMs < 1 || httpTimeoutMs > 30000) {
    throw new Error('HTTP_TIMEOUT_MS must be an integer between 1 and 30000');
  }
  if (authEnabled === 'true' && httpTimeoutMs > 5000) throw new Error('G7 session flow requires HTTP_TIMEOUT_MS <= 5000');
  const ordersSource = String(config.ORDERS_SOURCE ?? 'unconfigured');
  if (!['mock', 'unconfigured'].includes(ordersSource)) throw new Error('ORDERS_SOURCE must be mock or unconfigured');
  if (ordersSource === 'mock' && nodeEnv === 'production') throw new Error('ORDERS_SOURCE=mock is not allowed in production');
  return {
    ...config, PORT: port, H3_SANDBOX_ENABLED: sandbox, CORS_ORIGINS: origins, AUTH_ENABLED: authEnabled,
    NODE_ENV: nodeEnv, USE_MOCKS: useMocks === 'true', HTTP_TIMEOUT_MS: httpTimeoutMs,
    SECURITY_EVENTS_ENABLED: securityEventsEnabled === 'true',
    SECURITY_EVENTS_PREFETCH: securityEventsPrefetch,
    SECURITY_EVENTS_DLQ_QUEUE: securityEventsDlqQueue,
    SECURITY_EVENTS_MAX_RETRIES: securityEventsMaxRetries,
    SECURITY_EVENTS_BACKOFF_BASE_MS: securityEventsBackoffBaseMs,
    SECURITY_EVENTS_BACKOFF_MAX_MS: securityEventsBackoffMaxMs,
    ORDERS_SOURCE: ordersSource,
    AUTH_ISSUER: config.AUTH_ISSUER ?? (authEnabled === 'true' ? `${String(config.G7_API_URL).replace(/\/$/, '')}/auth` : nodeEnv === 'production' ? '' : 'http://127.0.0.1:4010'),
    AUTH_JWKS_URL: config.AUTH_JWKS_URL ?? (authEnabled === 'true' ? `${String(config.G7_API_URL).replace(/\/$/, '')}/auth/.well-known/jwks.json` : nodeEnv === 'production' ? '' : 'http://127.0.0.1:4010/jwks'),
  };
}
