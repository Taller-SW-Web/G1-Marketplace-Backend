import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { SessionStore, sessionHash } from '../src/auth/session.store';
import { G7SessionService } from '../src/auth/g7-session.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/http/configure-app';
import { WishlistModule } from '../src/wishlist/wishlist.module';
import { WishlistCatalog } from '../src/catalog/wishlist-catalog';

// This suite deletes only its explicitly named disposable local database rows.
// Both G7 and product projections below are fixtures, not external integration evidence.
const database = process.env.AUTH_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
const origin = 'http://127.0.0.1:3000';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
suite('F-002/F-003 G7 contract fixture + real PostgreSQL sessions', () => {
  let app: INestApplication; let server: Server; let prisma: PrismaService; let store: SessionStore;
  let issuer: string; let refreshCalls = 0; let logoutFails = false; let refreshFails: boolean | 'timeout' = false; let sessionRole = 'CLIENTE';
  const refreshes = new Map<string, string>();
  const challenges = new Set<string>();
  const serviceCredential = randomBytes(32).toString('base64url');
  const serviceBearer = randomBytes(32).toString('base64url');
  let introspectionInactive = false; let introspectionFails = false;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', use: 'sig', kid: 'fixture-g7-h4' };
  function tokens(id: string) {
    const refreshToken = randomBytes(32).toString('base64url'); refreshes.set(refreshToken, id);
    return { accessToken: sign({ tipo: 'acceso', roles: [sessionRole], permisos: [], email: id === A ? 'a@fixture.test' : 'b@fixture.test', jti: randomUUID() }, privateKey,
      { algorithm: 'RS256', keyid: jwk.kid, issuer, subject: id, expiresIn: 900 }),
      refreshToken, tokenType: 'Bearer', expiresIn: 900,
      usuario: { id, nombreCompleto: id === A ? 'Cuenta A fixture' : 'Cuenta B fixture', correo: id === A ? 'a@fixture.test' : 'b@fixture.test', roles: [sessionRole] } };
  }
  const cookie = (response: request.Response, name = 'g1_session') => {
    const values = response.headers['set-cookie'] as unknown as string[];
    return values.filter(value => value.startsWith(`${name}=`)).at(-1)!.split(';')[0];
  };
  const login = (correo = 'a@fixture.test', extra = {}) => request(app.getHttpServer()).post('/api/v1/auth/login')
    .set('Origin', origin).send({ correo, contrasena: 'Fixture-only!123', ...extra });
  async function expireAccess(value: string) {
    await store.locked(value.split('=')[1], async row => {
      if (!row || row.data.kind !== 'session') throw new Error('Missing test session');
      return { result: null, data: { ...row.data, accessExpiresAt: 0 } };
    });
  }
  beforeAll(async () => {
    const parsed = new URL(database!);
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/g1_auth_h4_test'
      || parsed.searchParams.get('schema') !== 'public') throw new Error('Use the disposable local g1_auth_h4_test database, public schema');
    process.env.DATABASE_URL = database;
    server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.endsWith('/.well-known/jwks.json')) { res.end(JSON.stringify({ keys: [jwk] })); return; }
      let text = ''; for await (const chunk of req) text += chunk;
      const body = (req.headers['content-type'] === 'application/x-www-form-urlencoded'
        ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text || '{}')) as Record<string, string>;
      const error = (status: number, code: string) => { res.statusCode = status; res.end(JSON.stringify({ status, code, detail: 'Do not forward this provider detail.' })); };
      if (req.url === '/api/v1/auth/token') {
        if (body.client_id !== 'fixture-client' || body.client_secret !== serviceCredential || body.grant_type !== 'client_credentials') return error(401, 'CLIENTE_INVALIDO');
        res.end(JSON.stringify({ accessToken: serviceBearer, tokenType: 'Bearer', expiresIn: 3600, scopes: ['tokens:introspeccion'] })); return;
      }
      if (req.url === '/api/v1/auth/introspeccion') {
        if (req.headers.authorization !== `Bearer ${serviceBearer}`) return error(401, 'TOKEN_INVALIDO');
        if (introspectionFails) return error(503, 'NO_DISPONIBLE');
        const claims = JSON.parse(Buffer.from(body.token.split('.')[1], 'base64url').toString());
        res.end(JSON.stringify(introspectionInactive ? { activo: false, motivo: 'TOKEN_REVOCADO' }
          : { activo: true, sub: claims.sub, email: claims.email, tipo: 'acceso', roles: ['CLIENTE'], permisos: [], exp: claims.exp })); return;
      }
      if (req.url === '/api/v1/auth/login') {
        if (body.contrasena !== 'Fixture-only!123') return error(401, 'CREDENCIALES_INVALIDAS');
        if (body.correo === 'mfa@fixture.test') {
          const challengeToken = randomBytes(32).toString('base64url'); challenges.add(challengeToken);
          res.end(JSON.stringify({ mfaRequerido: true, challengeToken, canal: 'EMAIL', expiraEn: 300 })); return;
        }
        res.end(JSON.stringify(tokens(body.correo === 'b@fixture.test' ? B : A))); return;
      }
      if (req.url?.startsWith('/api/v1/auth/otp/')) {
        if (!challenges.has(body.challengeToken)) return error(410, 'OTP_EXPIRADO');
        if (req.url.endsWith('/solicitar')) {
          res.statusCode = 202; res.end(JSON.stringify({ canal: 'EMAIL', destinoEnmascarado: 'm***@fixture.test', expiraEn: 300, desafioExpiraEn: 300 })); return;
        }
        if (body.codigo !== '123456') return error(401, 'CODIGO_INVALIDO');
        challenges.delete(body.challengeToken); res.end(JSON.stringify(tokens(A))); return;
      }
      if (req.url === '/api/v1/auth/refresh') {
        refreshCalls++;
        if (refreshFails === 'timeout') return;
        if (refreshFails) return error(503, 'NO_DISPONIBLE');
        const id = refreshes.get(body.refreshToken);
        if (!id) return error(401, 'REFRESCO_INVALIDO');
        refreshes.delete(body.refreshToken); res.end(JSON.stringify(tokens(id))); return;
      }
      if (req.url === '/api/v1/auth/logout') {
        if (logoutFails) return error(503, 'NO_DISPONIBLE');
        refreshes.delete(body.refreshToken); res.statusCode = 204; res.end(); return;
      }
      error(404, 'NO_ENCONTRADO');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`; issuer = `${base}/auth`;
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true,
      load: [() => ({ NODE_ENV: 'test', AUTH_ENABLED: 'true', G7_API_URL: base, AUTH_ISSUER: issuer,
        AUTH_JWKS_URL: `${issuer}/.well-known/jwks.json`, AUTH_SESSION_KEY: randomBytes(32).toString('base64'),
        G1_WEB_ORIGIN: origin, HTTP_TIMEOUT_MS: 500, CORS_ORIGINS: [origin], H3_SANDBOX_ENABLED: false,
        G7_INTROSPECTION_ENABLED: 'false', G7_SERVICE_CLIENT_ID: 'fixture-client', G7_SERVICE_CLIENT_SECRET: serviceCredential })] }), AuthModule, WishlistModule] })
      .overrideProvider(WishlistCatalog).useValue({ project: async (id: string) => ({ name: id, slug: 'fixture-product',
        brand: 'Fixture', image: null, price: null, availability: 'AVAILABLE' }) }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
    prisma = app.get(PrismaService); store = app.get(SessionStore);
  });
  beforeEach(async () => {
    refreshCalls = 0; logoutFails = false; refreshFails = false; sessionRole = 'CLIENTE';
    introspectionInactive = false; introspectionFails = false;
    app.get(ConfigService).set('G7_INTROSPECTION_ENABLED', 'false');
    await prisma.authSession.deleteMany(); await prisma.wishlistItem.deleteMany();
  });
  afterAll(async () => {
    if (app) { await prisma.authSession.deleteMany(); await prisma.wishlistItem.deleteMany(); await app.close(); }
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('stores only a hashed cookie and authenticated ciphertext; recovers after a new service instance', async () => {
    const response = await login().expect(200); const value = cookie(response);
    expect(response.body.authenticated).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/accessToken|refreshToken|challengeToken/);
    expect(String(response.headers['set-cookie'])).toContain('HttpOnly');
    const rows = await prisma.authSession.findMany(); expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(sessionHash(value.split('=')[1]));
    expect(rows[0].encrypted).not.toContain('accessToken');
    const existing = app.get(G7SessionService);
    const result = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(200);
    expect(result.body.user.id).toBe(A);
    // A separately constructed store proves persistence is independent of process Maps.
    const recovered = new SessionStore(prisma, app.get(ConfigService));
    expect(await recovered.locked(value.split('=')[1], async row => ({ result: row?.data.kind }))).toBe('session');
    expect(existing.enabled()).toBe(true);
  });
  it('does not establish a session before MFA, validates codes and consumes the challenge once', async () => {
    const response = await login('mfa@fixture.test').expect(200); const challenge = cookie(response, 'g1_challenge');
    expect(response.body.mfaRequerido).toBe(true); expect(response.body).not.toHaveProperty('challengeToken');
    await request(app.getHttpServer()).get('/api/v1/wishlist').set('Cookie', challenge).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/otp/solicitar').set('Cookie', challenge).set('Origin', origin).send({}).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/otp/verificar').set('Cookie', challenge).set('Origin', origin).send({ codigo: '999999' }).expect(401);
    const verified = await request(app.getHttpServer()).post('/api/v1/auth/otp/verificar').set('Cookie', challenge).set('Origin', origin).send({ codigo: '123456' }).expect(200);
    expect(verified.body.authenticated).toBe(true);
    await request(app.getHttpServer()).post('/api/v1/auth/otp/verificar').set('Cookie', challenge).set('Origin', origin).send({ codigo: '123456' }).expect(410);
  });
  it('serializes simultaneous refreshes using the shared row lock and retains the same private scope', async () => {
    const response = await login().expect(200); const value = cookie(response); await expireAccess(value);
    const results = await Promise.all([1, 2, 3].map(() => request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', value).set('Origin', origin).send({})));
    expect(results.map(result => result.status)).toEqual([200, 200, 200]); expect(refreshCalls).toBe(1);
    expect(results.every(result => result.body.scope === response.body.scope)).toBe(true);
  });
  it('invalidates an uncertain refresh and never retries its one-use token', async () => {
    const value = cookie(await login().expect(200)); await expireAccess(value); refreshFails = true;
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', value).set('Origin', origin).send({}).expect(503);
    const result = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(200);
    expect(result.body.authenticated).toBe(false); expect(refreshCalls).toBe(1); expect(await prisma.authSession.count()).toBe(0);
  });
  it('commits invalidation after a real HTTP timeout during refresh', async () => {
    const value = cookie(await login().expect(200)); await expireAccess(value); refreshFails = 'timeout';
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', value).set('Origin', origin).send({}).expect(503);
    expect(await prisma.authSession.count()).toBe(0); expect(refreshCalls).toBe(1);
    const response = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(200);
    expect(response.body.authenticated).toBe(false); expect(refreshCalls).toBe(1);
  });
  it('expires the server session and MFA challenge without provider calls', async () => {
    const value = cookie(await login().expect(200));
    await prisma.authSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const response = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(200);
    expect(response.body.authenticated).toBe(false); expect(refreshCalls).toBe(0);
    expect(String(response.headers['set-cookie'])).toContain('Max-Age=0');
    const challenge = cookie(await login('mfa@fixture.test').expect(200), 'g1_challenge');
    await prisma.authSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app.getHttpServer()).post('/api/v1/auth/otp/verificar').set('Cookie', challenge).set('Origin', origin).send({ codigo: '123456' }).expect(410);
    expect(await prisma.authSession.count()).toBe(0);
  });
  it('isolates actual wishlist rows for A/B and rejects anonymous, forged bearer and ownership queries', async () => {
    await prisma.wishlistItem.createMany({ data: [{ customerId: A, productId: 'ONLY-A' }, { customerId: B, productId: 'ONLY-B' }] });
    const a = cookie(await login().expect(200)); const b = cookie(await login('b@fixture.test').expect(200));
    const first = await request(app.getHttpServer()).get('/api/v1/wishlist').set('Cookie', a).expect(200);
    const second = await request(app.getHttpServer()).get('/api/v1/wishlist').set('Cookie', b).expect(200);
    expect(first.body.map((item: { productId: string }) => item.productId)).toEqual(['ONLY-A']);
    expect(second.body.map((item: { productId: string }) => item.productId)).toEqual(['ONLY-B']);
    await request(app.getHttpServer()).get('/api/v1/wishlist').expect(401);
    await request(app.getHttpServer()).get('/api/v1/wishlist').set('Cookie', a).set('Authorization', 'Bearer forged').expect(401);
    await request(app.getHttpServer()).get(`/api/v1/wishlist?customerId=${A}`).set('Cookie', b).expect(400);
    await request(app.getHttpServer()).delete('/api/v1/wishlist/items/ONLY-A').set('Cookie', b).set('Origin', origin).expect(204);
    expect(await prisma.wishlistItem.count({ where: { customerId: A } })).toBe(1);
    const bearer = tokens(A).accessToken;
    await request(app.getHttpServer()).get('/api/v1/wishlist').set('Authorization', `Bearer ${bearer}`).expect(200);
  });
  it('enforces CSRF and rejects token injection in bodies', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ correo: 'a@fixture.test', contrasena: 'Fixture-only!123' }).expect(403);
    const value = cookie(await login().expect(200));
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', value).set('Origin', 'https://evil.test').send({}).expect(403);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', value).set('Origin', origin).send({ refreshToken: 'injected' }).expect(400);
    await request(app.getHttpServer()).delete('/api/v1/wishlist/items/ONLY-A').set('Cookie', value).expect(403);
  });
  it('rejects revoked cookie and direct bearer access, then clears the persisted session on reload', async () => {
    app.get(ConfigService).set('G7_INTROSPECTION_ENABLED', 'true');
    const value = cookie(await login().expect(200));
    const bearer = tokens(A).accessToken;
    await request(app.getHttpServer()).get('/api/v1/wishlist').set('Cookie', value).expect(200);
    introspectionInactive = true;
    await request(app.getHttpServer()).get('/api/v1/wishlist').set('Cookie', value).expect(401);
    await request(app.getHttpServer()).get('/api/v1/wishlist').set('Authorization', `Bearer ${bearer}`).expect(401);
    const reloaded = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(401);
    expect(String(reloaded.headers['set-cookie'])).toContain('Max-Age=0');
    expect(await prisma.authSession.count()).toBe(0);
    expect(JSON.stringify(reloaded.body)).not.toMatch(/TOKEN_REVOCADO|accessToken|refreshToken/);
  });
  it('denies private access while introspection is unavailable without claiming logout or losing the refresh', async () => {
    app.get(ConfigService).set('G7_INTROSPECTION_ENABLED', 'true');
    const value = cookie(await login().expect(200));
    introspectionFails = true;
    await request(app.getHttpServer()).get('/api/v1/wishlist').set('Cookie', value).expect(503);
    const reloaded = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(503);
    expect(reloaded.headers['set-cookie']).toBeUndefined(); expect(await prisma.authSession.count()).toBe(1);
    introspectionFails = false;
    const recovered = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(200);
    expect(recovered.body.user.id).toBe(A); expect(refreshCalls).toBe(0);
  });
  it('closes locally during a provider logout failure and supports repeated logout', async () => {
    const value = cookie(await login().expect(200)); logoutFails = true;
    const closed = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', value).set('Origin', origin).send({}).expect(200);
    expect(closed.body).toEqual({ authenticated: false, remoteRevocationPending: true });
    await request(app.getHttpServer()).get('/api/v1/wishlist').set('Cookie', value).expect(401);
    const again = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', value).set('Origin', origin).send({}).expect(200);
    expect(again.body.remoteRevocationPending).toBe(false);
  });
  it('rejects signed non-customer identities and tampered persisted ciphertext', async () => {
    sessionRole = 'VENDEDOR'; await login().expect(503); expect(await prisma.authSession.count()).toBe(0);
    sessionRole = 'CLIENTE'; const value = cookie(await login().expect(200));
    await prisma.authSession.updateMany({ data: { encrypted: randomBytes(60).toString('base64') } });
    const response = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(200);
    expect(response.body.authenticated).toBe(false); expect(await prisma.authSession.count()).toBe(0);
  });
  it('never replays a refresh left in progress by a crashed BFF instance', async () => {
    const value = cookie(await login().expect(200));
    await store.locked(value.split('=')[1], async row => {
      if (!row || row.data.kind !== 'session') throw new Error('Missing test session');
      return { result: null, data: { ...row.data, accessExpiresAt: 0,
        refreshing: { id: randomUUID(), startedAt: Date.now() - 16000 } } };
    });
    const response = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', value).expect(200);
    expect(response.body.authenticated).toBe(false); expect(refreshCalls).toBe(0);
    expect(await prisma.authSession.count()).toBe(0);
  });
});
