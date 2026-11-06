import { randomBytes } from 'node:crypto';
import { G7SessionService } from './g7-session.service';
import { SessionData, SessionStore, sessionHash } from './session.store';

// Unit test with an in-memory Prisma double (no PostgreSQL): proves how logout reports a stored
// session it cannot read. The real-database behavior is covered by test/auth-g7.e2e-spec.ts (CI).
type Row = { id: string; encrypted: string; expiresAt: Date };
const origin = 'http://127.0.0.1:3000';
const tokens = { accessToken: 'a', refreshToken: 'refresh-fixture', tokenType: 'Bearer' as const, expiresIn: 900,
  usuario: { id: '11111111-1111-4111-8111-111111111111', nombreCompleto: 'Fixture', roles: ['CLIENTE'] } };
const session: SessionData = { kind: 'session', tokens, accessExpiresAt: Date.now() + 600000, scope: 'scope' };

function setup() {
  const rows = new Map<string, Row>();
  const tx = {
    $queryRaw: jest.fn(async () => []),
    authSession: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => { rows.delete(where.id); }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { encrypted: string } }) => { rows.get(where.id)!.encrypted = data.encrypted; }),
    },
  };
  const prisma = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    authSession: { ...tx.authSession, create: jest.fn(async ({ data }: { data: Row }) => { rows.set(data.id, data); }),
      deleteMany: jest.fn(async ({ where }: { where: { id: string } }) => { rows.delete(where.id); }) } };
  const settings: Record<string, unknown> = { AUTH_ENABLED: 'true', NODE_ENV: 'test', G1_WEB_ORIGIN: origin,
    AUTH_SESSION_KEY: randomBytes(32).toString('base64') };
  const config = { get: (key: string) => settings[key], getOrThrow: (key: string) => settings[key] };
  const store = new SessionStore(prisma as never, config as never);
  const provider = { call: jest.fn(async () => null) };
  const service = new G7SessionService(config as never, provider as never, store, {} as never);
  const logout = (opaque: string) => service.logout({ headers: { cookie: `g1_session=${opaque}`, origin } },
    { append: jest.fn() });
  return { rows, store, provider, logout };
}

describe('logout of stored sessions that cannot be read', () => {
  it('revokes a readable session remotely and reports nothing pending', async () => {
    const { store, provider, logout } = setup();
    const opaque = await store.create(session, new Date(Date.now() + 60000));
    expect(await logout(opaque)).toEqual({ authenticated: false, remoteRevocationPending: false });
    expect(provider.call).toHaveBeenCalledWith('auth/logout', { refreshToken: 'refresh-fixture' });
  });
  it('reports revocation pending, without claiming success, when the stored ciphertext is unreadable', async () => {
    const { store, rows, provider, logout } = setup();
    const opaque = await store.create(session, new Date(Date.now() + 60000));
    rows.get(sessionHash(opaque))!.encrypted = randomBytes(60).toString('base64');
    expect(await logout(opaque)).toEqual({ authenticated: false, remoteRevocationPending: true });
    expect(rows.size).toBe(0); expect(provider.call).not.toHaveBeenCalled();
    // The row is gone, so repeating the logout is a clean idempotent no-op.
    expect(await logout(opaque)).toEqual({ authenticated: false, remoteRevocationPending: false });
  });
  it('reports revocation pending for an expired stored session', async () => {
    const { store, rows, provider, logout } = setup();
    const opaque = await store.create(session, new Date(Date.now() - 1000));
    expect(await logout(opaque)).toEqual({ authenticated: false, remoteRevocationPending: true });
    expect(rows.size).toBe(0); expect(provider.call).not.toHaveBeenCalled();
  });
  it('treats an unknown cookie and a pending MFA challenge as a clean logout', async () => {
    const { store, rows, provider, logout } = setup();
    expect(await logout(randomBytes(32).toString('base64url'))).toEqual({ authenticated: false, remoteRevocationPending: false });
    const challenge = await store.create({ kind: 'challenge', challengeToken: 'c' }, new Date(Date.now() + 60000));
    expect(await logout(challenge)).toEqual({ authenticated: false, remoteRevocationPending: false });
    expect(rows.size).toBe(0); expect(provider.call).not.toHaveBeenCalled();
  });
  it('still reports pending when the provider logout fails', async () => {
    const { store, provider, logout } = setup();
    provider.call.mockRejectedValueOnce(new Error('down'));
    const opaque = await store.create(session, new Date(Date.now() + 60000));
    expect(await logout(opaque)).toEqual({ authenticated: false, remoteRevocationPending: true });
  });
});
