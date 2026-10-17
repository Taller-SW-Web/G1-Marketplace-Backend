import { sign, verify } from 'jsonwebtoken';
import { isUUID } from 'class-validator';

export const SANDBOX_ISSUER = 'marketplace-h3-sandbox';
export const SANDBOX_AUDIENCE = 'marketplace-h3';
export const SANDBOX_CUSTOMERS = {
  A: '11111111-1111-4111-8111-111111111111',
  B: '22222222-2222-4222-8222-222222222222',
} as const;

export function issueSandboxToken(customerId: string, secret: string): string {
  if (!isUUID(customerId) || Buffer.byteLength(secret) < 32) throw new Error('Invalid sandbox token configuration');
  return sign({}, secret, {
    algorithm: 'HS256', subject: customerId, issuer: SANDBOX_ISSUER,
    audience: SANDBOX_AUDIENCE, expiresIn: '15m',
  });
}

export function verifySandboxToken(token: string, secret: string): string {
  const payload = verify(token, secret, {
    algorithms: ['HS256'], issuer: SANDBOX_ISSUER, audience: SANDBOX_AUDIENCE,
  });
  if (typeof payload === 'string' || typeof payload.sub !== 'string' || !isUUID(payload.sub)
    || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    throw new Error('Invalid sandbox identity');
  }
  return payload.sub;
}
