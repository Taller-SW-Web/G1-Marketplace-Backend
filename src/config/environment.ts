export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
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
  const authEnabled = String(config.AUTH_ENABLED ?? 'false');
  if (!['true', 'false'].includes(authEnabled)) throw new Error('AUTH_ENABLED must be true or false');
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
  const useMocks = String(config.USE_MOCKS ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(useMocks)) throw new Error('USE_MOCKS must be true or false');
  if (useMocks === 'true' && nodeEnv === 'production') throw new Error('USE_MOCKS cannot be enabled in production');
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
    ORDERS_SOURCE: ordersSource,
    AUTH_ISSUER: config.AUTH_ISSUER ?? (authEnabled === 'true' ? `${String(config.G7_API_URL).replace(/\/$/, '')}/auth` : nodeEnv === 'production' ? '' : 'http://127.0.0.1:4010'),
    AUTH_JWKS_URL: config.AUTH_JWKS_URL ?? (authEnabled === 'true' ? `${String(config.G7_API_URL).replace(/\/$/, '')}/auth/.well-known/jwks.json` : nodeEnv === 'production' ? '' : 'http://127.0.0.1:4010/jwks'),
  };
}
