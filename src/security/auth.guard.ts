import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { AuthenticatedRequest, CheckoutPrincipal } from './auth.types';
import { verifySandboxToken } from '../identity/sandbox-token';

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

interface JwtClaims {
  iss?: unknown;
  sub?: unknown;
  exp?: unknown;
  nbf?: unknown;
  tipo?: unknown;
}

interface JsonWebKeySet {
  keys?: Array<Record<string, unknown>>;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JWKS_CACHE_MS = 5 * 60 * 1000;

@Injectable()
export class AuthGuard implements CanActivate {
  private cachedKeys?: JsonWebKeySet;
  private keysFetchedAt = 0;

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    const match = typeof value === 'string' ? /^Bearer\s+([^\s]+)$/i.exec(value) : null;
    if (!match) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });

    request.user = await this.authenticate(match[1]);
    return true;
  }

  async authenticate(token: string): Promise<CheckoutPrincipal> {
    // Algorithm selection grants no identity: verifyToken still checks signature,
    // claims and the explicit sandbox/environment restrictions.
    let algorithm: unknown;
    try {
      if (token.length > 8192) throw new Error('Token too large');
      algorithm = this.decodeJson<JwtHeader>(token.split('.')[0])?.alg;
    } catch {
      throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
    }
    if (algorithm === 'HS256') return this.verifyToken(token, '', '');
    if (algorithm !== 'RS256') throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
    const issuer = this.config.get<string>('AUTH_ISSUER');
    const jwksUrl = this.config.get<string>('AUTH_JWKS_URL');
    if (!issuer || !jwksUrl) {
      throw new ServiceUnavailableException({ error: { code: 'AUTH_CONFIGURATION_UNAVAILABLE' } });
    }

    return this.verifyToken(token, issuer, jwksUrl);
  }

  protected async verifyToken(
    token: string,
    issuer: string,
    jwksUrl: string,
  ): Promise<CheckoutPrincipal> {
    try {
      if (token.length > 8192) throw new Error('Token too large');
      const parts = token.split('.');
      if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
        throw new Error('Malformed token');
      }
      const header = this.decodeJson<JwtHeader>(parts[0]);
      if (header.alg === 'HS256') {
        const environment = this.config.get<string>('NODE_ENV', process.env.NODE_ENV ?? 'development');
        if (!this.config.get<boolean>('H3_SANDBOX_ENABLED', false)
          || !['development', 'test'].includes(environment)) throw new Error('Sandbox disabled');
        return { sub: verifySandboxToken(token, this.config.getOrThrow<string>('H3_JWT_SECRET')) };
      }
      const claims = this.decodeJson<JwtClaims>(parts[1]);
      if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
        throw new Error('Unsupported token algorithm');
      }

      const jwk = await this.findKey(jwksUrl, header.kid, false);
      if (!jwk) {
        const refreshed = await this.findKey(jwksUrl, header.kid, true);
        if (!refreshed) throw new Error('Unknown signing key');
        return this.verifyClaims(parts, claims, issuer, refreshed);
      }
      return this.verifyClaims(parts, claims, issuer, jwk);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
    }
  }

  private verifyClaims(
    parts: string[],
    claims: JwtClaims,
    issuer: string,
    jwk: Record<string, unknown>,
  ): CheckoutPrincipal {
    const key = createPublicKey({ key: jwk as never, format: 'jwk' });
    const signatureIsValid = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], 'base64url'),
    );
    const now = Math.floor(Date.now() / 1000);
    if (
      !signatureIsValid ||
      claims.iss !== issuer ||
      claims.tipo !== 'acceso' ||
      typeof claims.exp !== 'number' ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= now ||
      (claims.nbf !== undefined && typeof claims.nbf !== 'number') ||
      (typeof claims.nbf === 'number' && (!Number.isFinite(claims.nbf) || claims.nbf > now)) ||
      typeof claims.sub !== 'string' ||
      !UUID_PATTERN.test(claims.sub)
    ) {
      throw new Error('Invalid token claims');
    }
    return { sub: claims.sub };
  }

  private async findKey(
    jwksUrl: string,
    kid: string,
    refresh: boolean,
  ): Promise<Record<string, unknown> | undefined> {
    let jwks = this.cachedKeys;
    if (refresh || !jwks || Date.now() - this.keysFetchedAt > JWKS_CACHE_MS) {
      try {
        const response = await fetch(jwksUrl, {
          signal: AbortSignal.timeout(this.config.get<number>('HTTP_TIMEOUT_MS', 3000)),
        });
        if (!response.ok) throw new Error('JWKS request failed');
        const body: unknown = await response.json();
        if (!this.isJwks(body)) throw new Error('Invalid JWKS');
        this.cachedKeys = body;
        this.keysFetchedAt = Date.now();
        jwks = body;
      } catch {
        throw new ServiceUnavailableException({ error: { code: 'AUTH_KEYS_UNAVAILABLE' } });
      }
    }
    return jwks.keys?.find(
      (key) => key.kid === kid && key.kty === 'RSA' && (!key.use || key.use === 'sig'),
    );
  }

  private decodeJson<T>(part: string): T {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  }

  private isJwks(value: unknown): value is JsonWebKeySet {
    return (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray((value as JsonWebKeySet).keys)
    );
  }
}
