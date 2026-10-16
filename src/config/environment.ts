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
  return { ...config, PORT: port, H3_SANDBOX_ENABLED: sandbox, CORS_ORIGINS: origins };
}
