import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { AccountController } from '../src/auth/account.controller';
import { AccountService } from '../src/auth/account.service';
import { G7Client } from '../src/auth/g7.client';
import { G7SessionService } from '../src/auth/g7-session.service';
import { SessionStore } from '../src/auth/session.store';
import { AuthGuard } from '../src/security/auth.guard';

const origin = 'http://127.0.0.1:3000';
const draft = { correo: 'new@fixture.test', contrasena: 'Only-fixture!123', nombres: 'Cuenta Prueba', apellidos: 'Local', celular: '+51900000000', aceptaTerminos: true };
const policy = { longitudMinima: 12, requiereMayuscula: true, requiereMinuscula: true, requiereDigito: true,
  requiereCaracterEspecial: false, historial: 5, rechazaComunes: true, rechazaDatosPersonales: true };
describe('F-001/F-004/F-005 G7 HTTP contract fixtures (not G7 REAL)', () => {
  let app: INestApplication; let server: Server;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const settings: Record<string, unknown> = { NODE_ENV: 'test', AUTH_ENABLED: 'true',
    G7_REGISTRATION_ENABLED: 'false', G7_RECOVERY_ENABLED: 'false', G1_WEB_ORIGIN: origin, HTTP_TIMEOUT_MS: 500 };
  const storage = { create: jest.fn(), remove: jest.fn(), locked: jest.fn() };
  let policyBroken = false; let wrongRegistrationStatus = false;
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '{}'); calls.push({ path: req.url!, body });
      const send = (status: number, value?: unknown) => { res.statusCode = status; res.end(value === undefined ? undefined : JSON.stringify(value)); };
      if (req.url === '/api/v1/password/politica') return send(200, policyBroken ? { longitudMinima: 0 } : { ...policy, internal: 'do-not-forward' });
      if (req.url === '/api/v1/auth/registro') {
        if (body.correo === 'conflict@fixture.test') return send(409, { code: 'CORREO_NO_DISPONIBLE', detail: 'provider-private' });
        if (body.contrasena === 'weak') return send(422, { code: 'POLITICA_INCUMPLIDA', detail: 'provider-private' });
        return send(wrongRegistrationStatus ? 200 : 201, { id: '11111111-1111-4111-8111-111111111111', estado: 'PENDIENTE_VERIFICACION', accessToken: 'never-forward' });
      }
      if (req.url === '/api/v1/password/recuperar') {
        if (body.correo === 'limit@fixture.test') { res.setHeader('Retry-After', '5'); return send(429, { code: 'DEMASIADAS_SOLICITUDES' }); }
        return send(202);
      }
      if (req.url === '/api/v1/password/restablecer') {
        if (body.token === 'expired-fixture') return send(410, { code: 'TOKEN_RECUPERACION_EXPIRADO' });
        if (body.token === 'invalid-fixture') return send(401, { code: 'TOKEN_RECUPERACION_INVALIDO' });
        if (body.nuevaContrasena === 'weak') return send(422, { code: 'POLITICA_INCUMPLIDA' });
        return send(204);
      }
      send(404, { code: 'NO_ENCONTRADO' });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    settings.G7_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const config = { get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
      getOrThrow: (key: string) => { if (settings[key] === undefined) throw new Error('Missing fixture setting'); return settings[key]; } };
    const module = await Test.createTestingModule({ controllers: [AccountController], providers: [AccountService, G7Client,
      G7SessionService, AuthGuard, { provide: ConfigService, useValue: config }, { provide: SessionStore, useValue: storage }] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
    await app.init();
  });
  beforeEach(() => {
    calls.length = 0; policyBroken = false; wrongRegistrationStatus = false;
    settings.G7_REGISTRATION_ENABLED = 'true'; settings.G7_RECOVERY_ENABLED = 'true';
    jest.clearAllMocks();
  });
  afterEach(() => {
    // These public operations never persist passwords, recovery tokens or a local identity.
    expect(storage.create).not.toHaveBeenCalled(); expect(storage.locked).not.toHaveBeenCalled();
  });
  afterAll(async () => { await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const post = (path: string, body: object) => request(app.getHttpServer()).post(`/api/v1/${path}`).set('Origin', origin).send(body);

  it('keeps each unpublished provider operation gated without contacting G7', async () => {
    settings.G7_REGISTRATION_ENABLED = 'false'; settings.G7_RECOVERY_ENABLED = 'false';
    await post('auth/registro', draft).expect(503);
    await post('password/recuperar', { correo: 'a@fixture.test' }).expect(503);
    await post('password/restablecer', { token: 'fixture', nuevaContrasena: 'Any-fixture!123' }).expect(503);
    expect(calls).toEqual([]);
    const response = await request(app.getHttpServer()).get('/api/v1/auth/capabilities').expect(200);
    expect(response.body).toEqual({ login: true, registro: false, recuperacion: false });
  });
  it('sets MARKETPLACE on the server and returns pending verification without a session', async () => {
    const response = await post('auth/registro', draft).expect(201);
    expect(calls[0].body.canalOrigen).toBe('MARKETPLACE');
    expect(Object.keys(calls[0].body).sort()).toEqual([...Object.keys(draft), 'canalOrigen'].sort());
    expect(response.body).toEqual({ id: '11111111-1111-4111-8111-111111111111', estado: 'PENDIENTE_VERIFICACION' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });
  it.each([{ canalOrigen: 'CHATBOT' }, { returnUrl: 'https://evil.test' }, { confirmacion: 'secret' }, { customerId: 'injected' }])('rejects extra registration fields: %j', async extra => {
    await post('auth/registro', { ...draft, ...extra }).expect(400); expect(calls).toEqual([]);
  });
  it('requires deliberate consent, nonblank names and the agreed phone format', async () => {
    await post('auth/registro', { ...draft, aceptaTerminos: false }).expect(400);
    await post('auth/registro', { ...draft, nombres: '   ' }).expect(400);
    await post('auth/registro', { ...draft, celular: '900000000' }).expect(400); expect(calls).toEqual([]);
  });
  it('preserves neutral conflict/policy codes without forwarding provider details', async () => {
    const conflict = await post('auth/registro', { ...draft, correo: 'conflict@fixture.test' }).expect(409);
    const weak = await post('auth/registro', { ...draft, contrasena: 'weak' }).expect(422);
    expect(conflict.body.code).toBe('CORREO_NO_DISPONIBLE'); expect(weak.body.code).toBe('POLITICA_INCUMPLIDA');
    expect(JSON.stringify([conflict.body, weak.body])).not.toContain('provider-private');
  });
  it('does not infer registration acceptance from an incompatible successful status', async () => {
    wrongRegistrationStatus = true; await post('auth/registro', draft).expect(503);
  });
  it('loads current policy and never substitutes a hardcoded policy if it is invalid', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/password/politica').expect(200);
    expect(response.body).toEqual(policy);
    policyBroken = true; await request(app.getHttpServer()).get('/api/v1/password/politica').expect(503);
  });
  it('returns the same empty 202 for known and unknown recovery emails', async () => {
    const a = await post('password/recuperar', { correo: 'known@fixture.test' }).expect(202);
    const b = await post('password/recuperar', { correo: 'unknown@fixture.test' }).expect(202);
    expect(a.text).toBe(b.text); expect(a.text).toBe('');
    const limited = await post('password/recuperar', { correo: 'limit@fixture.test' }).expect(429);
    expect(limited.body.code).toBe('DEMASIADAS_SOLICITUDES');
    expect(limited.body.retryAfterSeconds).toBe(5);
  });
  it('resets only through the contracted token/body and returns no credentials or identity', async () => {
    const response = await post('password/restablecer', { token: 'fixture-opaque', nuevaContrasena: 'New-fixture!123' }).expect(204);
    expect(response.text).toBe(''); expect(response.headers['set-cookie']).toBeUndefined();
    expect(calls[0].body).toEqual({ token: 'fixture-opaque', nuevaContrasena: 'New-fixture!123' });
    await post('password/restablecer', { token: 'fixture', nuevaContrasena: 'New-fixture!123', customerId: 'injected' }).expect(400);
  });
  it.each([['expired-fixture', 410, 'TOKEN_RECUPERACION_EXPIRADO'], ['invalid-fixture', 401, 'TOKEN_RECUPERACION_INVALIDO']])('preserves reset result %s', async (token, status, code) => {
    const response = await post('password/restablecer', { token, nuevaContrasena: 'New-fixture!123' }).expect(status as number);
    expect(response.body.code).toBe(code);
  });
  it('rejects cross-origin account mutations before contacting G7', async () => {
    await request(app.getHttpServer()).post('/api/v1/password/recuperar').set('Origin', 'https://evil.test').send({ correo: 'a@fixture.test' }).expect(403);
    expect(calls).toEqual([]);
  });
});
