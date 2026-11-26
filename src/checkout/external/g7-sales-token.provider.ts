import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderError } from './provider-error';

const REQUIRED_SCOPE = 'ventas:pedidos:crear';
const REQUIRED_AUDIENCE = 'api-ventas';
const MAX_TOKEN_LENGTH = 8192;
const RENEWAL_MARGIN_MS = 30_000;

interface CachedToken {
  value: string;
  expiresAt: number;
  renewAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function claimValues(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\s+/u).filter(Boolean);
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function tokenHasGrant(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!isRecord(claims)) return false;
    return claimValues(claims.aud).includes(REQUIRED_AUDIENCE) &&
      (claimValues(claims.scope).includes(REQUIRED_SCOPE) || claimValues(claims.scopes).includes(REQUIRED_SCOPE));
  } catch {
    return false;
  }
}

@Injectable()
export class G7SalesTokenProvider {
  private cached?: CachedToken;
  private pending?: Promise<string>;

  constructor(private readonly config: ConfigService) {}

  async getAccessToken(): Promise<string> {
    if (this.config.get<string>('G5_SALES_INTEGRATION_APPROVED') !== 'true' ||
        this.config.get<string>('CHECKOUT_SALES_SOURCE') !== 'g5' ||
        this.config.get<string>('AUTH_ENABLED') !== 'true' ||
        this.config.get<boolean>('USE_MOCKS', false)) {
      throw new ProviderError(503, 'SALES_AUTH_UNAVAILABLE');
    }
    if (this.cached && Date.now() < this.cached.renewAt) return this.cached.value;
    if (this.pending) return this.pending;

    const previous = this.cached;
    const request = this.requestToken().catch((error: unknown) => {
      if (previous && Date.now() < previous.expiresAt) return previous.value;
      this.cached = undefined;
      throw error;
    });
    this.pending = request;
    try {
      return await request;
    } finally {
      if (this.pending === request) this.pending = undefined;
    }
  }

  private async requestToken(): Promise<string> {
    const clientId = this.config.get<string>('G7_SERVICE_CLIENT_ID');
    const clientSecret = this.config.get<string>('G7_SERVICE_CLIENT_SECRET');
    const apiUrl = this.config.get<string>('G7_API_URL');
    const timeoutMs = this.config.get<number>('G7_SERVICE_TOKEN_TIMEOUT_MS', 15_000);
    let tokenUrl: URL;
    try {
      const base = new URL(apiUrl ?? '');
      const localHttp = this.config.get<string>('NODE_ENV') !== 'production' && base.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
      if ((base.protocol !== 'https:' && !localHttp) || base.username || base.password || base.search || base.hash ||
          base.pathname.replace(/\/$/u, '') !== '/api/v1' ||
          !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000 ||
          !clientId || !/^[A-Za-z0-9._-]{1,100}$/u.test(clientId) ||
          !clientSecret || clientSecret.length < 32 || clientSecret.length > 1024 || /[\r\n\0]/u.test(clientSecret)) {
        throw new Error('invalid configuration');
      }
      tokenUrl = new URL(`${base.href.replace(/\/$/u, '')}/auth/token`);
    } catch {
      throw new ProviderError(503, 'SALES_AUTH_UNAVAILABLE');
    }

    const issuedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        // G7 derives audience and scope from the client grant. Do not send either.
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ProviderError(503, 'SALES_AUTH_UNAVAILABLE');
    }
    if (!response.ok) throw new ProviderError(503, 'SALES_AUTH_UNAVAILABLE');

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ProviderError(503, 'SALES_AUTH_UNAVAILABLE');
    }
    if (!isRecord(value) || typeof value.accessToken !== 'string' || value.accessToken.length === 0 ||
        value.accessToken.length > MAX_TOKEN_LENGTH || !/^[\x21-\x7e]+$/u.test(value.accessToken) ||
        value.tokenType !== 'Bearer' || !Number.isSafeInteger(value.expiresIn) || Number(value.expiresIn) < 1 ||
        Number(value.expiresIn) > 3600 || !Array.isArray(value.scopes) ||
        !value.scopes.every((scope) => typeof scope === 'string') || !value.scopes.includes(REQUIRED_SCOPE) ||
        !tokenHasGrant(value.accessToken)) {
      throw new ProviderError(503, 'SALES_AUTH_UNAVAILABLE');
    }

    const lifetimeMs = Number(value.expiresIn) * 1000;
    const renewAt = issuedAt + lifetimeMs - Math.min(RENEWAL_MARGIN_MS, Math.floor(lifetimeMs * 0.1));
    if (renewAt <= Date.now()) throw new ProviderError(503, 'SALES_AUTH_UNAVAILABLE');
    this.cached = { value: value.accessToken, expiresAt: issuedAt + lifetimeMs, renewAt };
    return value.accessToken;
  }
}
