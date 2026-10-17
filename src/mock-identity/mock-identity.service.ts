import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync, KeyObject, randomUUID, sign, timingSafeEqual } from 'node:crypto';

/**
 * Emisor JWT RS256 de PRUEBA para demostrar la integración Vercel ↔ Render en el Hito 3.
 * No representa al microservicio de Seguridad. Se desactiva con USE_MOCKS=false o
 * STRICT_PRODUCTION=true (Hito 4), y en producción exige MOCK_AUTH_SHARED_SECRET.
 */
const MOCK_SUBJECTS: Record<string, string> = {
  default: '11111111-1111-4111-8111-111111111111',
  empty: '22222222-2222-4222-8222-222222222222',
};
const TOKEN_TTL_SECONDS = 15 * 60;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

@Injectable()
export class MockIdentityService {
  private readonly privateKey: KeyObject;
  private readonly jwk: Record<string, unknown>;
  private readonly kid = `cloud-mock-${randomUUID()}`;

  constructor(private readonly config: ConfigService) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    this.privateKey = privateKey;
    this.jwk = { ...publicKey.export({ format: 'jwk' }), kid: this.kid, use: 'sig', alg: 'RS256' };
  }

  isEnabled(): boolean {
    const useMocks = this.config.get<boolean>('USE_MOCKS', false);
    const strict = String(this.config.get('STRICT_PRODUCTION') ?? 'false').toLowerCase() === 'true';
    return useMocks === true && !strict;
  }

  /** En producción el secreto es obligatorio; en local se permite sin secreto. */
  isAuthorized(provided: string | undefined): boolean {
    const expected = this.config.get<string>('MOCK_AUTH_SHARED_SECRET');
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    if (!expected) return !isProduction;
    if (!provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  jwks(): { keys: Record<string, unknown>[] } {
    return { keys: [this.jwk] };
  }

  issue(user: string): { access_token: string; token_type: 'Bearer'; expires_in: number } | null {
    const subject = MOCK_SUBJECTS[user];
    if (!subject) return null;
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'RS256', typ: 'JWT', kid: this.kid });
    const claims = encode({
      iss: this.config.get<string>('AUTH_ISSUER'),
      sub: subject,
      tipo: 'acceso',
      iat: issuedAt,
      exp: issuedAt + TOKEN_TTL_SECONDS,
    });
    const signingInput = `${header}.${claims}`;
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), this.privateKey).toString('base64url');
    return { access_token: `${signingInput}.${signature}`, token_type: 'Bearer', expires_in: TOKEN_TTL_SECONDS };
  }
}
