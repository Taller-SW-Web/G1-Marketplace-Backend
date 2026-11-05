import { CatalogError } from './errors';
import type { CatalogFetch } from './types';

export const SERVICE_CLIENT_ID = 'modulo-marketplace';
export const SERVICE_SCOPE = 'catalogo:leer';

const RENEWAL_MARGIN_MS = 60_000;
const REFRESH_RETRY_DELAY_MS = 5_000;
const MAX_TOKEN_LENGTH = 16_384;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  renewAt: number;
}

interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scopes: string[];
}

export interface ClientCredentialsTokenOptions {
  tokenUrl: URL;
  clientSecret: string;
  timeoutMs: number;
  fetchImpl: CatalogFetch;
  now?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unavailable(diagnostic: string): CatalogError {
  return new CatalogError('CATALOG_UNAVAILABLE', 503, diagnostic);
}

function parseTokenResponse(value: unknown): TokenResponse {
  if (!isRecord(value)) throw unavailable('G7_TOKEN_INVALID_RESPONSE');

  const { accessToken, tokenType, expiresIn, scopes } = value;
  if (
    typeof accessToken !== 'string' || accessToken.length === 0 || accessToken.length > MAX_TOKEN_LENGTH ||
    !/^[\x21-\x7e]+$/.test(accessToken) || tokenType !== 'Bearer' ||
    typeof expiresIn !== 'number' || !Number.isSafeInteger(expiresIn) || expiresIn <= 0 ||
    !Array.isArray(scopes) || !scopes.every((scope) => typeof scope === 'string') ||
    !scopes.includes(SERVICE_SCOPE)
  ) throw unavailable('G7_TOKEN_INVALID_RESPONSE');

  return { accessToken, tokenType, expiresIn, scopes };
}

/**
 * Process-local client_credentials token cache. Refreshes are single-flight;
 * a still-valid cached token may be used briefly if an early renewal fails.
 */
export function createClientCredentialsTokenProvider(options: ClientCredentialsTokenOptions) {
  const now = options.now ?? Date.now;
  let cached: CachedToken | undefined;
  let refreshInFlight: Promise<string> | undefined;
  let retryRefreshAt = 0;

  async function requestToken(): Promise<CachedToken> {
    let response: Response;
    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SERVICE_CLIENT_ID,
        client_secret: options.clientSecret,
        scope: SERVICE_SCOPE,
      });
      response = await options.fetchImpl(options.tokenUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      // Never propagate transport errors: custom fetch errors may contain the secret or URL.
      throw unavailable('G7_TOKEN_UNAVAILABLE');
    }

    if (!response.ok) throw unavailable('G7_TOKEN_REJECTED');

    let tokenResponse: TokenResponse;
    try {
      tokenResponse = parseTokenResponse(await response.json());
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      throw unavailable('G7_TOKEN_INVALID_RESPONSE');
    }

    const issuedAt = now();
    const lifetimeMs = tokenResponse.expiresIn * 1000;
    const renewalMargin = Math.min(RENEWAL_MARGIN_MS, Math.floor(lifetimeMs * 0.1));
    return {
      accessToken: tokenResponse.accessToken,
      expiresAt: issuedAt + lifetimeMs,
      renewAt: issuedAt + lifetimeMs - renewalMargin,
    };
  }

  async function getAccessToken(): Promise<string> {
    const currentTime = now();
    if (cached && currentTime < cached.renewAt) return cached.accessToken;
    if (refreshInFlight) return refreshInFlight;

    // Bound retries after issuer failures. A cached token is usable only until
    // its actual expiration; without one, fail closed during the same backoff.
    if (currentTime < retryRefreshAt) {
      if (cached && currentTime < cached.expiresAt) return cached.accessToken;
      throw unavailable('G7_TOKEN_UNAVAILABLE');
    }

    let refresh: Promise<string>;
    refresh = requestToken()
      .then((next) => {
        cached = next;
        retryRefreshAt = 0;
        return next.accessToken;
      })
      .catch((error: unknown) => {
        retryRefreshAt = now() + REFRESH_RETRY_DELAY_MS;
        if (cached && now() < cached.expiresAt) return cached.accessToken;
        cached = undefined;
        if (error instanceof CatalogError) throw error;
        throw unavailable('G7_TOKEN_UNAVAILABLE');
      })
      .finally(() => {
        if (refreshInFlight === refresh) refreshInFlight = undefined;
      });

    refreshInFlight = refresh;
    return refresh;
  }

  return { getAccessToken };
}
