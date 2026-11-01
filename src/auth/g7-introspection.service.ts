import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { G7Client, record } from './g7.client';

const unavailable = () => new ServiceUnavailableException({ error: { code: 'AUTH_UNAVAILABLE' } });
const inactive = () => new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 256
  && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 256);

@Injectable()
export class G7IntrospectionService {
  private cached?: { token: string; expiresAt: number };
  private pending?: Promise<string>;
  constructor(private readonly config: ConfigService, private readonly g7: G7Client) {}
  enabled() { return this.config.get('G7_INTROSPECTION_ENABLED') === 'true'; }

  private async serviceToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.token;
    if (this.pending) return this.pending;
    const startedAt = Date.now();
    this.pending = (async () => {
      const clientId = this.config.get<string>('G7_SERVICE_CLIENT_ID');
      const clientSecret = this.config.get<string>('G7_SERVICE_CLIENT_SECRET');
      if (!clientId || !clientSecret) throw unavailable();
      let value: unknown;
      try {
        value = await this.g7.call('auth/token', { grant_type: 'client_credentials', client_id: clientId,
          client_secret: clientSecret, scope: 'tokens:introspeccion' }, undefined, 200, true);
      } catch { throw unavailable(); }
      if (!record(value) || value.tokenType !== 'Bearer' || typeof value.accessToken !== 'string'
        || !value.accessToken || value.accessToken.length > 8192 || /\s/.test(value.accessToken)
        || !Number.isInteger(value.expiresIn) || Number(value.expiresIn) < 1 || Number(value.expiresIn) > 3600
        || !strings(value.scopes) || !value.scopes.includes('tokens:introspeccion')) throw unavailable();
      const lifetime = Number(value.expiresIn) * 1000;
      const expiresAt = startedAt + lifetime - Math.min(30000, lifetime / 2);
      if (expiresAt <= Date.now()) throw unavailable();
      this.cached = { token: value.accessToken, expiresAt };
      return value.accessToken;
    })();
    try { return await this.pending; } finally { this.pending = undefined; }
  }

  async assertActive(accessToken: string, expectedSub: string): Promise<void> {
    if (!this.enabled()) return;
    const serviceToken = await this.serviceToken();
    let value: unknown;
    try { value = await this.g7.call('auth/introspeccion', { token: accessToken }, serviceToken, 200); }
    catch {
      // Do not retry this request or fall back to offline validation on failure.
      // A later request can obtain another service token after rejection/expiry.
      if (this.cached?.token === serviceToken) this.cached = undefined;
      throw unavailable();
    }
    if (!record(value) || typeof value.activo !== 'boolean') throw unavailable();
    if (!value.activo) throw inactive(); // Never expose G7's account/revocation reason.
    if (value.sub !== expectedSub || value.tipo !== 'acceso' || !strings(value.roles) || !strings(value.permisos)
      || !Number.isInteger(value.exp) || Number(value.exp) <= Math.floor(Date.now() / 1000)) throw unavailable();
    // No cache of active results: every protected request observes current G7 state.
  }
}
