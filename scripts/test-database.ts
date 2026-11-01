export function validateTestDatabase(env: NodeJS.ProcessEnv): string {
  const value = env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL is required');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid TEST_DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.pathname !== '/marketplace_h3_test'
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('Integration tests require local marketplace_h3_test database and public schema');
  }
  if (env.DATABASE_URL) {
    const development = new URL(env.DATABASE_URL);
    const sameHost = development.hostname === url.hostname
      || ['localhost', '127.0.0.1', '[::1]'].includes(development.hostname);
    if (sameHost && (development.port || '5432') === (url.port || '5432')
      && decodeURIComponent(development.pathname) === decodeURIComponent(url.pathname)) {
      throw new Error('Test database must differ from DATABASE_URL');
    }
  }
  return value;
}
