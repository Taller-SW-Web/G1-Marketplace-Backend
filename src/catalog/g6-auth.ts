import { CatalogError } from './errors';
import { createClientCredentialsTokenProvider } from './client-credentials-token';
import type { CatalogEnvironment, CatalogFetch } from './types';

/** Shared authentication policy for catalog reads and F011. No automatic mode changes. */
export function createG6Auth(env: CatalogEnvironment, fetchImpl: CatalogFetch, timeoutMs: number) {
  const mode = env.PRODUCTOS_AUTH_MODE ?? 'service-token';
  const unavailable = (reason: string) => new CatalogError('CATALOG_UNAVAILABLE', 503, reason);
  if (!['service-token', 'demo-no-auth', 'public-read-only', 'client-credentials'].includes(mode) ||
      (env.NODE_ENV === 'production' && mode === 'demo-no-auth') ||
      (mode === 'service-token' && !env.PRODUCTOS_SERVICE_TOKEN)) throw unavailable('PROVIDER_NOT_APPROVED');

  let serviceTokens: ReturnType<typeof createClientCredentialsTokenProvider> | undefined;
  if (mode === 'client-credentials') {
    let tokenUrl: URL;
    try { tokenUrl = new URL(env.G7_TOKEN_URL || ''); }
    catch { throw unavailable('PROVIDER_CONFIG_MISSING'); }
    const localIssuer = env.NODE_ENV !== 'production' && tokenUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(tokenUrl.hostname);
    if ((tokenUrl.protocol !== 'https:' && !localIssuer) || tokenUrl.username || tokenUrl.password ||
        tokenUrl.pathname !== '/api/v1/auth/token' || tokenUrl.search || tokenUrl.hash ||
        !env.PRODUCTOS_CLIENT_SECRET) throw unavailable('PROVIDER_NOT_APPROVED');
    serviceTokens = createClientCredentialsTokenProvider({ tokenUrl, clientSecret: env.PRODUCTOS_CLIENT_SECRET,
      timeoutMs, fetchImpl });
  }
  const staticToken = env.PRODUCTOS_SERVICE_TOKEN;
  return {
    mode,
    async getAuthorization(): Promise<string | undefined> {
      if (mode === 'service-token') return `Bearer ${staticToken}`;
      if (mode === 'client-credentials') {
        if (!serviceTokens) throw unavailable('G7_TOKEN_UNAVAILABLE');
        return `Bearer ${await serviceTokens.getAccessToken()}`;
      }
      // In public modes G7 URL/secret and any stale static token are deliberately ignored.
      return undefined;
    },
  };
}
