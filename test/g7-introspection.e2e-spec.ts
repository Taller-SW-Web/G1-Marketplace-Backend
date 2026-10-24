import { Controller, Get, INestApplication, Req, UseGuards } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { sign } from 'jsonwebtoken';
import request from 'supertest';
import { G7IntegrationModule } from '../src/auth/g7-integration.module';
import { AuthGuard } from '../src/security/auth.guard';
import { OptionalAuthGuard } from '../src/security/optional-auth.guard';
import { AuthenticatedRequest } from '../src/security/auth.types';
import { configureApp } from '../src/http/configure-app';

@Controller('introspection-test')
class ProtectedFixtureController {
  @Get('private') @UseGuards(AuthGuard)
  privateData(@Req() req: AuthenticatedRequest) { return { owner: req.user!.sub }; }
  @Get('optional') @UseGuards(OptionalAuthGuard)
  optionalData(@Req() req: AuthenticatedRequest) { return { owner: req.user?.sub ?? 'anonymous' }; }
}

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
describe('G7 service token/introspection HTTP contract fixture (not G7 REAL)', () => {
  let app: INestApplication; let server: Server; let issuer: string;
  let grants = 0; let inspections = 0; let active = true; let grantStatus = 200; let inspectionStatus = 200;
  let grantTimeout = false; let inspectionTimeout = false; let lifetime = 3600; let scopes: string[];
  let replacement: Record<string, unknown> | undefined;
  const clientId = 'g1-fixture-only'; const clientSecret = randomBytes(32).toString('base64') + '&=+';
  const technicalToken = randomBytes(32).toString('base64url');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', use: 'sig', kid: 'introspection-fixture' };
  const settings: Record<string, unknown> = { NODE_ENV: 'test', AUTH_ENABLED: 'true',
    G7_INTROSPECTION_ENABLED: 'true', G7_SERVICE_CLIENT_ID: clientId, G7_SERVICE_CLIENT_SECRET: clientSecret,
    HTTP_TIMEOUT_MS: 200, CORS_ORIGINS: [] };
  const config = { get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
    getOrThrow: (key: string) => { if (settings[key] === undefined) throw new Error('Fixture setting missing'); return settings[key]; } };
  function token(sub = A) { return sign({ tipo: 'acceso', roles: ['CLIENTE'], permisos: [], jti: randomBytes(16).toString('hex') },
    privateKey, { algorithm: 'RS256', keyid: jwk.kid, issuer, subject: sub, expiresIn: 900 }); }
  const get = (value: string, path = 'private') => request(app.getHttpServer()).get(`/introspection-test/${path}`).set('Authorization', `Bearer ${value}`);

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      const send = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)); };
      if (req.url?.endsWith('/.well-known/jwks.json')) return send(200, { keys: [jwk] });
      let raw = ''; for await (const chunk of req) raw += chunk;
      if (req.url === '/api/v1/auth/token') {
        grants++;
        const form = new URLSearchParams(raw);
        if (req.headers['content-type'] !== 'application/x-www-form-urlencoded' || req.headers.authorization
          || form.get('grant_type') !== 'client_credentials' || form.get('client_id') !== clientId
          || form.get('client_secret') !== clientSecret || form.get('scope') !== 'tokens:introspeccion') return send(400, { code: 'VALIDACION' });
        if (grantTimeout) return;
        return send(grantStatus, grantStatus === 200 ? { accessToken: technicalToken, tokenType: 'Bearer', expiresIn: lifetime, scopes }
          : { code: 'CLIENTE_INVALIDO', detail: 'provider-private-detail' });
      }
      if (req.url === '/api/v1/auth/introspeccion') {
        inspections++;
        if (req.headers.authorization !== `Bearer ${technicalToken}` || req.headers['content-type'] !== 'application/json') return send(401, { code: 'TOKEN_INVALIDO' });
        if (inspectionTimeout) return;
        const body = JSON.parse(raw); const claims = JSON.parse(Buffer.from(body.token.split('.')[1], 'base64url').toString());
        return send(inspectionStatus, inspectionStatus !== 200 ? { code: 'SCOPE_INSUFICIENTE', detail: 'provider-private-detail' }
          : replacement ?? (active ? { activo: true, sub: claims.sub, email: 'fixture@fixture.test', tipo: 'acceso',
            roles: ['CLIENTE'], permisos: [], exp: claims.exp } : { activo: false, motivo: 'USUARIO_BLOQUEADO' }));
      }
      send(404, { code: 'NO_ENCONTRADO' });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    settings.G7_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    issuer = `${settings.G7_API_URL}/auth`; settings.AUTH_ISSUER = issuer;
    settings.AUTH_JWKS_URL = `${issuer}/.well-known/jwks.json`;
  });
  beforeEach(async () => {
    grants = 0; inspections = 0; active = true; grantStatus = 200; inspectionStatus = 200;
    grantTimeout = false; inspectionTimeout = false; lifetime = 3600; scopes = ['tokens:introspeccion']; replacement = undefined;
    settings.G7_INTROSPECTION_ENABLED = 'true';
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), G7IntegrationModule],
      controllers: [ProtectedFixtureController], providers: [AuthGuard, OptionalAuthGuard],
    }).overrideProvider(ConfigService).useValue(config).compile();
    app = module.createNestApplication(); configureApp(app); await app.init();
  });
  afterEach(async () => { jest.restoreAllMocks(); await app.close(); });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

  it('does not contact integration endpoints when explicitly disabled', async () => {
    settings.G7_INTROSPECTION_ENABLED = 'false';
    expect((await get(token()).expect(200)).body).toEqual({ owner: A });
    expect(grants).toBe(0); expect(inspections).toBe(0);
  });
  it('rejects malformed signatures before requesting service credentials and preserves optional anonymous access', async () => {
    await get('forged').expect(401); expect(grants).toBe(0);
    const result = await request(app.getHttpServer()).get('/introspection-test/optional').expect(200);
    expect(result.body.owner).toBe('anonymous'); expect(grants).toBe(0);
  });
  it('shares only the technical grant across concurrent A/B calls and never caches active decisions', async () => {
    const a = token(); const b = token(B);
    const responses = await Promise.all([get(a), get(b), get(a)]);
    expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
    expect(responses.map(response => response.body.owner)).toEqual([A, B, A]);
    expect(grants).toBe(1); expect(inspections).toBe(3);
    active = false;
    const denied = await get(a, 'optional').expect(401);
    expect(JSON.stringify(denied.body)).not.toMatch(/USUARIO_BLOQUEADO|accessToken|scope|provider-private/);
    expect(inspections).toBe(4); expect(grants).toBe(1);
  });
  it('obtains a new technical grant after its expiry without extending the old one', async () => {
    lifetime = 1; await get(token()).expect(200);
    const later = Date.now() + 2000; jest.spyOn(Date, 'now').mockReturnValue(later);
    await get(token()).expect(200); expect(grants).toBe(2);
  });
  it.each([401, 403, 503])('sanitizes failed technical grant %s as unavailable without a fallback', async status => {
    grantStatus = status;
    const response = await get(token()).expect(503);
    expect(inspections).toBe(0); expect(grants).toBe(1);
    expect(JSON.stringify(response.body)).not.toMatch(/CLIENTE_INVALIDO|provider-private|client_secret/);
  });
  it('rejects a service grant without the required permission', async () => {
    scopes = ['roles:leer']; await get(token()).expect(503); expect(inspections).toBe(0);
  });
  it.each([{ activo: 'true' }, { activo: true, sub: B }, { activo: true, sub: A, tipo: 'servicio' },
    { activo: true, sub: A, tipo: 'acceso', roles: [], permisos: [], exp: 1 },
    { activo: true, sub: A, tipo: 'acceso', roles: 'CLIENTE', permisos: [], exp: 9999999999 }])
  ('fails closed on an incompatible active result %j', async value => {
    replacement = value; await get(token()).expect(503);
  });
  it.each([401, 403, 503])('does not retry a rejected technical bearer (%s) within the protected request', async status => {
    inspectionStatus = status; await get(token()).expect(503);
    expect(grants).toBe(1); expect(inspections).toBe(1);
    inspectionStatus = 200; await get(token()).expect(200); expect(grants).toBe(2);
  });
  it.each(['grant', 'inspection'])('times out %s and never grants offline access', async where => {
    grantTimeout = where === 'grant'; inspectionTimeout = where === 'inspection';
    await get(token()).expect(503); expect(grants).toBe(1); expect(inspections).toBe(where === 'grant' ? 0 : 1);
  });
});
