import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { CatalogError } from './errors';
import { assertPublicCatalogRead } from './public-read-only';
import type { CatalogEnvironment, CatalogFetch } from './types';

import { CONTRACT_VERSION, CONTRACT_SHA } from './provider';
export { CONTRACT_VERSION, CONTRACT_SHA } from './provider';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const invalidProvider = (reason: string) => new CatalogError('CATALOG_UNAVAILABLE', 503, reason);

/** F-011 GET client; shares public route policy with the existing catalog transport. */
export function createG6Client(env: CatalogEnvironment, fetchImpl: CatalogFetch = fetch) {
  const timeoutMs = Number(env.PRODUCTOS_TIMEOUT_MS || 5000);
  const authMode = env.PRODUCTOS_AUTH_MODE ?? 'service-token';
  const mediaHosts = new Set((env.PRODUCTOS_MEDIA_HOSTS || '').split(',').map((value) => value.trim()).filter(Boolean));
  let base: URL;
  try { base = new URL(env.PRODUCTOS_BASE_URL || ''); }
  catch { throw invalidProvider('PROVIDER_CONFIG_MISSING'); }
  if (
    (base.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) ||
    base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
    !['service-token', 'demo-no-auth', 'public-read-only'].includes(authMode) ||
    (env.NODE_ENV === 'production' && authMode === 'demo-no-auth') ||
    (authMode === 'service-token' && !env.PRODUCTOS_SERVICE_TOKEN) ||
    (authMode === 'public-read-only' && (env.CATALOG_SOURCE !== 'real' || env.BFF_MODE !== 'real')) ||
    !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000 ||
    env.PRODUCTOS_CONTRACT_VERSION !== CONTRACT_VERSION || env.PRODUCTOS_CONTRACT_SHA !== CONTRACT_SHA ||
    env.CATALOG_INTEGRATION_APPROVED !== 'true'
  ) throw invalidProvider('PROVIDER_NOT_APPROVED');

  async function request(path: string, requestId?: string,
    options: { allowProductNotFound?: boolean; signal?: AbortSignal } = {}): Promise<unknown> {
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw invalidProvider('PUBLIC_READ_ONLY_ROUTE_NOT_ALLOWED');
    if (authMode === 'public-read-only') {
      try { assertPublicCatalogRead('GET', path, { allowDetailBySlug: true }); }
      catch { throw invalidProvider('PUBLIC_READ_ONLY_ROUTE_NOT_ALLOWED'); }
    }
    // G1 accepts opaque IDs; G6 validates X-Correlation-Id as UUID.
    const providerRequestId = requestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
      ? requestId : randomUUID();
    if (requestId && providerRequestId !== requestId) Logger.log(JSON.stringify({
      event: 'catalog_provider_correlation',
      requestId: /^[A-Za-z0-9._-]{1,64}$/.test(requestId) ? requestId : undefined,
      providerRequestId,
    }), 'CatalogProvider');
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json', 'X-Correlation-Id': providerRequestId,
      };
      // Both explicit anonymous modes omit credentials, even if a stale token exists.
      // Public-read-only additionally enforces the route/query allowlist above.
      if (authMode === 'service-token') headers.Authorization = `Bearer ${env.PRODUCTOS_SERVICE_TOKEN}`;
      const response = await fetchImpl(url, {
        method: 'GET', headers, credentials: 'omit',
        redirect: 'error', cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        if (options.allowProductNotFound && response.status === 404) {
          const problem: unknown = await response.json();
          if (record(problem) && problem.code === 'PRODUCTO_NO_ENCONTRADO') return null;
        }
        if (response.status === 422) {
          const problem: unknown = await response.json();
          if (record(problem) && ['CATEGORIA_INVALIDA', 'MARCA_INVALIDA'].includes(String(problem.code)))
            throw new CatalogError('INVALID_FILTER', 400);
        }
        throw invalidProvider(`PROVIDER_HTTP_${response.status}`);
      }
      try { return await response.json(); }
      catch { throw invalidProvider('PROVIDER_INVALID_JSON'); }
    } catch (error: unknown) {
      if (error instanceof CatalogError) throw error;
      const name = record(error) && typeof error.name === 'string' ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError')
        throw new CatalogError('CATALOG_TIMEOUT', 503, 'PROVIDER_TIMEOUT');
      throw invalidProvider('PROVIDER_INVALID_RESPONSE');
    }
  }

  return { get: request, mediaHosts, timeoutMs };
}
