import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../http/api-error';
import { AuthGuard } from '../security/auth.guard';
import { G7Client, G7Session, record } from './g7.client';
import { SessionData, SessionStore } from './session.store';
import { LoginDto } from './login.dto';

export interface CookieResponse { append(name: string, value: string): unknown }
export type CookieRequest = { headers: { cookie?: string; origin?: string; 'sec-fetch-site'?: string } };
const unavailable = () => new ApiError(503, 'AUTH_UNAVAILABLE', 'Acceso no disponible temporalmente.');
const unauthenticated = () => new ApiError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.');
type AuthenticatedData = Extract<SessionData, { kind: 'session' }>;

@Injectable()
export class G7SessionService {
  constructor(private readonly config: ConfigService, private readonly provider: G7Client,
    private readonly store: SessionStore, private readonly verifier: AuthGuard) {}

  enabled() { return this.config.get<string>('AUTH_ENABLED') === 'true'; }
  private cookieName(challenge = false) {
    return `${this.config.get('NODE_ENV') === 'production' ? '__Host-' : ''}g1_${challenge ? 'challenge' : 'session'}`;
  }
  cookie(request: CookieRequest, challenge = false): string | undefined {
    const prefix = `${this.cookieName(challenge)}=`;
    const values = request.headers.cookie?.split(';').map(part => part.trim()).filter(part => part.startsWith(prefix));
    return values?.length === 1 ? values[0].slice(prefix.length) : undefined;
  }
  private setCookie(response: CookieResponse, opaque: string, age: number, challenge = false) {
    response.append('Set-Cookie', `${this.cookieName(challenge)}=${opaque}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${this.config.get('NODE_ENV') === 'production' ? '; Secure' : ''}`);
  }
  assertOrigin(request: CookieRequest) {
    if (!this.enabled()) throw unavailable();
    const expected = this.config.get<string>('G1_WEB_ORIGIN');
    if (!expected || request.headers.origin !== expected || request.headers['sec-fetch-site'] === 'cross-site') {
      throw new ApiError(403, 'FORBIDDEN', 'Realiza esta operación desde Marketplace.');
    }
  }

  private async validate(value: unknown, expectedSub?: string): Promise<AuthenticatedData> {
    if (!record(value) || typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string'
      || value.refreshToken.length < 1 || value.refreshToken.length > 8192 || value.tokenType !== 'Bearer'
      || typeof value.expiresIn !== 'number' || !Number.isInteger(value.expiresIn) || value.expiresIn < 1
      || value.expiresIn > 900 || !record(value.usuario) || typeof value.usuario.nombreCompleto !== 'string'
      || !Array.isArray(value.usuario.roles)) throw unavailable();
    const principal = await this.verifier.authenticate(value.accessToken);
    const claims = JSON.parse(Buffer.from(value.accessToken.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    const now = Math.floor(Date.now() / 1000);
    if (claims.tipo !== 'acceso' || !Array.isArray(claims.roles) || !claims.roles.includes('CLIENTE')
      || !claims.roles.every(role => typeof role === 'string') || typeof claims.iat !== 'number'
      || !Number.isInteger(claims.iat) || claims.iat > now + 30 || typeof claims.jti !== 'string' || !claims.jti
      || typeof claims.exp !== 'number' || claims.exp <= claims.iat
      || principal.sub !== value.usuario.id || (expectedSub && principal.sub !== expectedSub)) throw unavailable();
    // Persist only the fields consumed by G1, not the full G7 profile.
    const tokens: G7Session = { accessToken: value.accessToken, refreshToken: value.refreshToken, tokenType: 'Bearer',
      expiresIn: value.expiresIn, usuario: { id: principal.sub,
        nombreCompleto: value.usuario.nombreCompleto.slice(0, 200), roles: claims.roles as string[] } };
    return { kind: 'session', tokens, accessExpiresAt: Math.min(Date.now() + value.expiresIn * 1000, claims.exp * 1000), scope: randomUUID() };
  }
  private publicSession(data: AuthenticatedData) {
    return { authenticated: true, user: data.tokens.usuario, scope: data.scope };
  }

  private async establish(value: unknown, request: CookieRequest, response: CookieResponse) {
    const data = await this.validate(value);
    await this.store.remove(this.cookie(request));
    const opaque = await this.store.create(data, new Date(Date.now() + 7 * 24 * 3600000));
    this.setCookie(response, opaque, 7 * 24 * 3600);
    this.setCookie(response, '', 0, true);
    return this.publicSession(data);
  }

  async login(input: LoginDto, request: CookieRequest, response: CookieResponse) {
    this.assertOrigin(request);
    // Starting another login cannot retain an old user's cached identity.
    await this.store.remove(this.cookie(request));
    await this.store.remove(this.cookie(request, true));
    this.setCookie(response, '', 0); this.setCookie(response, '', 0, true);
    const value = await this.provider.call('auth/login', input);
    if (record(value) && value.mfaRequerido === true) {
      if (typeof value.challengeToken !== 'string' || !value.challengeToken || value.challengeToken.length > 8192
        || typeof value.expiraEn !== 'number' || !Number.isInteger(value.expiraEn) || value.expiraEn < 1 || value.expiraEn > 300) throw unavailable();
      const opaque = await this.store.create({ kind: 'challenge', challengeToken: value.challengeToken }, new Date(Date.now() + value.expiraEn * 1000));
      this.setCookie(response, opaque, value.expiraEn, true);
      return { mfaRequerido: true, canal: 'EMAIL', expiraEn: value.expiraEn };
    }
    return this.establish(value, request, response);
  }

  async otp(request: CookieRequest, response: CookieResponse, codigo?: string) {
    this.assertOrigin(request);
    const result = await this.store.locked<{ value?: unknown; error?: unknown }>(this.cookie(request, true), async (session) => {
      if (!session || session.data.kind !== 'challenge') return { result: { error: new ApiError(410, 'OTP_EXPIRADO', 'Vuelve a iniciar sesión.') } };
      try {
        const value = await this.provider.call(codigo === undefined ? 'auth/otp/solicitar' : 'auth/otp/verificar',
          { challengeToken: session.data.challengeToken, ...(codigo === undefined ? { canal: 'EMAIL' } : { codigo }) });
        if (codigo !== undefined) return { result: { value }, remove: true };
        if (!record(value) || value.canal !== 'EMAIL' || typeof value.destinoEnmascarado !== 'string'
          || typeof value.expiraEn !== 'number' || typeof value.desafioExpiraEn !== 'number') throw unavailable();
        return { result: { value: { canal: 'EMAIL', destinoEnmascarado: value.destinoEnmascarado.slice(0, 254),
          expiraEn: value.expiraEn, desafioExpiraEn: value.desafioExpiraEn } } };
      } catch (error) {
        const terminal = error instanceof ApiError && ['OTP_INTENTOS_AGOTADOS', 'OTP_EXPIRADO', 'TOKEN_INVALIDO'].includes((error.getResponse() as { code: string }).code);
        return { result: { error }, remove: terminal || codigo !== undefined && !(error instanceof ApiError && error.getStatus() === 401) };
      }
    });
    if ('error' in result) throw result.error;
    if (codigo === undefined) return result.value;
    return this.establish(result.value, request, response);
  }

  async access(opaque: string | undefined, force = false): Promise<AuthenticatedData | null> {
    const deadline = Date.now() + 16000;
    while (Date.now() < deadline) {
      const step = await this.store.locked<{ data?: AuthenticatedData | null; claim?: AuthenticatedData; wait?: boolean }>(opaque, async session => {
        if (!session || session.data.kind !== 'session') return { result: { data: null } };
        const data = session.data;
        if (data.refreshing) {
          // A crashed refresh owner cannot authorize a replay of its old token.
          if (Date.now() - data.refreshing.startedAt > 15000) return { result: { data: null }, remove: true };
          return { result: { wait: true } };
        }
        if (data.accessExpiresAt > Date.now() + (force ? 60000 : 30000)) return { result: { data } };
        const claimed = { ...data, refreshing: { id: randomUUID(), startedAt: Date.now() } };
        // Commit BEFORE contacting G7. Even a process crash or failed final commit
        // leaves a durable marker that prevents retrying a single-use refresh token.
        return { result: { claim: claimed }, data: claimed };
      });
      if (!step.wait && !step.claim) return step.data ?? null;
      if (step.wait) { await new Promise(resolve => setTimeout(resolve, 50)); continue; }
      const claimed = step.claim!;
      let next: AuthenticatedData | undefined;
      try {
        next = await this.validate(await this.provider.call('auth/refresh', { refreshToken: claimed.tokens.refreshToken }), claimed.tokens.usuario.id);
        next.scope = claimed.scope;
        const committed = await this.store.locked<AuthenticatedData | null>(opaque, async session => {
          if (!session || session.data.kind !== 'session' || session.data.refreshing?.id !== claimed.refreshing?.id) return { result: null };
          return { result: next!, data: next };
        });
        if (!committed) {
          // Logout/expiry won the race: never resurrect the deleted local session.
          try { await this.provider.call('auth/logout', { refreshToken: next.tokens.refreshToken }); } catch { /* No local access remains. */ }
        }
        return committed;
      } catch (error) {
        await this.store.remove(opaque);
        if (next) { try { await this.provider.call('auth/logout', { refreshToken: next.tokens.refreshToken }); } catch { /* No local access remains. */ } }
        throw error;
      }
    }
    throw unavailable();
  }
  async session(request: CookieRequest, response?: CookieResponse) {
    if (!this.enabled()) return { authenticated: false, scope: 'anonymous' };
    const opaque = this.cookie(request);
    try {
      const data = await this.access(opaque);
      if (!data && opaque && response) this.setCookie(response, '', 0);
      return data ? this.publicSession(data) : { authenticated: false, scope: 'anonymous' };
    } catch (error) {
      if (opaque && response) this.setCookie(response, '', 0);
      throw error;
    }
  }
  async refresh(request: CookieRequest) {
    this.assertOrigin(request);
    const data = await this.access(this.cookie(request), true);
    if (!data) throw unauthenticated();
    return this.publicSession(data);
  }
  async logout(request: CookieRequest, response: CookieResponse) {
    this.assertOrigin(request);
    // Read and delete under one lock; do not renew merely to log out.
    const removed = await this.store.locked(this.cookie(request), async session => ({
      result: session?.data.kind === 'session' ? { tokens: session.data.tokens, refreshing: Boolean(session.data.refreshing) } : null, remove: true,
    }));
    await this.store.remove(this.cookie(request, true));
    this.setCookie(response, '', 0); this.setCookie(response, '', 0, true);
    let remoteRevocationPending = removed?.refreshing ?? false;
    if (removed) {
      try { await this.provider.call('auth/logout', { refreshToken: removed.tokens.refreshToken }); }
      catch { remoteRevocationPending = true; }
    }
    return { authenticated: false, remoteRevocationPending };
  }
}
