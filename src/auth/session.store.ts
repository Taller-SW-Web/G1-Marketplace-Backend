import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { G7Session } from './g7.client';

export type SessionData =
  | { kind: 'challenge'; challengeToken: string }
  | { kind: 'session'; tokens: G7Session; accessExpiresAt: number; scope: string;
      refreshing?: { id: string; startedAt: number } };
export type StoredSession = { id: string; expiresAt: Date; data: SessionData };
export type SessionChange<T> = { result: T; data?: SessionData; remove?: boolean };
export const sessionHash = (opaque: string) => createHash('sha256').update(opaque).digest('hex');

@Injectable()
export class SessionStore {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private key(): Buffer {
    const key = Buffer.from(this.config.getOrThrow<string>('AUTH_SESSION_KEY'), 'base64');
    if (key.length !== 32) throw new Error('AUTH_SESSION_KEY must encode 32 bytes');
    return key;
  }

  private encrypt(id: string, data: SessionData): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(id));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }

  private decrypt(id: string, encrypted: string): SessionData {
    const bytes = Buffer.from(encrypted, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as SessionData;
  }

  async create(data: SessionData, expiresAt: Date): Promise<string> {
    const opaque = randomBytes(32).toString('base64url');
    const id = sessionHash(opaque);
    await this.prisma.authSession.create({ data: { id, encrypted: this.encrypt(id, data), expiresAt } });
    return opaque;
  }

  async remove(opaque: string | undefined): Promise<void> {
    if (opaque && /^[A-Za-z0-9_-]{43}$/.test(opaque)) {
      await this.prisma.authSession.deleteMany({ where: { id: sessionHash(opaque) } });
    }
  }

  async locked<T>(opaque: string | undefined, operation: (session: StoredSession | null) => Promise<SessionChange<T>>): Promise<T> {
    if (!opaque || !/^[A-Za-z0-9_-]{43}$/.test(opaque)) return (await operation(null)).result;
    const id = sessionHash(opaque);
    // The DB lock serializes claims/updates across BFF instances. Never use a process Map.
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${id} FOR UPDATE`;
      const row = await tx.authSession.findUnique({ where: { id } });
      let session: StoredSession | null = null;
      if (row && row.expiresAt.getTime() > Date.now()) {
        try { session = { id, expiresAt: row.expiresAt, data: this.decrypt(id, row.encrypted) }; }
        catch { /* A tampered row or changed key never grants a session. */ }
      }
      const change = await operation(session);
      if (row && (!session || change.remove)) await tx.authSession.delete({ where: { id } });
      else if (row && change.data) await tx.authSession.update({ where: { id }, data: { encrypted: this.encrypt(id, change.data) } });
      return change.result;
    }, { maxWait: 10000, timeout: 15000 });
  }
}
