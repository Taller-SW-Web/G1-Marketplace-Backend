import { INestApplication, Logger } from '@nestjs/common';
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
import { configureApp } from '../src/http/configure-app';

// F-001 registration BFF QA. G7 is a local HTTP double: this is NOT evidence of the real G7,
// its verification e-mail, its password policy or its duplicate-account behavior.
const origin = 'http://127.0.0.1:3000';
const PASSWORD = 'Fixture-Pass!9z-never-log';
const UUID = '11111111-1111-4111-8111-111111111111';
const draft = { correo: 'new.person@fixture.test', contrasena: PASSWORD, nombres: ' Cuenta ', apellidos: ' Prueba ', celular: '+51900000000', aceptaTerminos: true };

describe('F-001 registration BFF QA (G7 double, full HTTP pipeline)', () => {
  let app: INestApplication; let server: Server;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let mode: 'ok' | 'hang' | 'bad-id' | 'bad-state' | 'tokens' | 'echo500' | 'conflict' | 'weak' | 'v400' | 'unknown409' = 'ok';
  const settings: Record<string, unknown> = { NODE_ENV: 'test', AUTH_ENABLED: 'true', G7_REGISTRATION_ENABLED: 'true',
    G7_RECOVERY_ENABLED: 'false', G1_WEB_ORIGIN: origin, HTTP_TIMEOUT_MS: 300, CORS_ORIGINS: [origin] };
  const storage = { create: jest.fn(), remove: jest.fn(), locked: jest.fn() };
  const logged: string[] = [];

  beforeAll(async () => {
    for (const level of ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...a: unknown[]) => { logged.push(JSON.stringify(a, (_k, v) => v instanceof Error ? `${v.message}\n${v.stack}` : v)); });
      jest.spyOn(Logger, level).mockImplementation((...a: unknown[]) => { logged.push(JSON.stringify(a)); });
    }
    for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) {
      jest.spyOn(console, method).mockImplementation((...a: unknown[]) => { logged.push(JSON.stringify(a)); });
    }
    server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      let raw = ''; for await (const chunk of req) raw += chunk;
      calls.push({ path: req.url!, body: JSON.parse(raw || '{}') });
      const body = calls[calls.length - 1].body;
      if (mode === 'hang') return;
      const send = (status: number, value?: unknown) => { res.statusCode = status; res.end(value === undefined ? undefined : JSON.stringify(value)); };
      if (req.url !== '/api/v1/auth/registro') return send(404, { code: 'NO_ENCONTRADO' });
      if (mode === 'conflict') return send(409, { code: 'CORREO_NO_DISPONIBLE', message: `${body.correo} ya existe`, detail: body.contrasena });
      if (mode === 'unknown409') return send(409, { code: 'CUENTA_EXISTE_VERIFICADA', message: String(body.correo) });
      if (mode === 'weak') return send(422, { code: 'POLITICA_INCUMPLIDA', message: `rechazada ${body.contrasena}` });
      if (mode === 'v400') return send(400, { code: 'VALIDACION', message: `invalido ${body.correo} ${body.contrasena}` });
      if (mode === 'echo500') return send(500, { message: `fallo ${body.contrasena} ${body.correo}` });
      if (mode === 'bad-id') return send(201, { id: '-'.repeat(36), estado: 'PENDIENTE_VERIFICACION' });
      if (mode === 'bad-state') return send(201, { id: UUID, estado: 'ACTIVA' });
      if (mode === 'tokens') return send(201, { id: UUID, estado: 'PENDIENTE_VERIFICACION', accessToken: 'tok-never-forward', refreshToken: 'ref-never-forward', enlace: 'https://g7.test/verificar?t=secret' });
      send(201, { id: UUID, estado: 'PENDIENTE_VERIFICACION' });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    settings.G7_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const config = { get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
      getOrThrow: (key: string) => { if (settings[key] === undefined) throw new Error('Missing fixture setting'); return settings[key]; } };
    const module = await Test.createTestingModule({ controllers: [AccountController], providers: [AccountService, G7Client,
      G7SessionService, AuthGuard, { provide: ConfigService, useValue: config }, { provide: SessionStore, useValue: storage }] }).compile();
    app = module.createNestApplication({ logger: false }); configureApp(app); await app.init();
  });
  beforeEach(() => { calls.length = 0; logged.length = 0; mode = 'ok'; settings.G7_REGISTRATION_ENABLED = 'true'; jest.clearAllMocks(); });
  // No local identity, session or password storage may ever be touched by registration.
  afterEach(() => { expect(storage.create).not.toHaveBeenCalled(); expect(storage.locked).not.toHaveBeenCalled(); expect(storage.remove).not.toHaveBeenCalled(); });
  afterAll(async () => { jest.restoreAllMocks(); await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

  const register = (body: unknown, from: string | null = origin, cookie?: string) => {
    const r = request(app.getHttpServer()).post('/api/v1/auth/registro'); if (from) r.set('Origin', from); if (cookie) r.set('Cookie', cookie);
    return r.send(body as object);
  };
  const noSecrets = (response?: request.Response) => {
    const everything = `${logged.join('\n')}\n${response ? response.text + JSON.stringify(response.headers) : ''}`;
    for (const secret of [PASSWORD, 'tok-never-forward', 'ref-never-forward', 'secret']) expect(everything).not.toContain(secret);
  };

  it('fixes canalOrigen=MARKETPLACE, forwards only the contracted fields and trims names', async () => {
    const response = await register(draft).expect(201);
    expect(calls[0].body).toEqual({ ...draft, nombres: 'Cuenta', apellidos: 'Prueba', canalOrigen: 'MARKETPLACE' });
    expect(response.body).toEqual({ id: UUID, estado: 'PENDIENTE_VERIFICACION' });
    expect(response.headers['set-cookie']).toBeUndefined(); expect(String(response.headers['cache-control'])).toContain('no-store');
    noSecrets(response);
  });
  it.each(['CHATBOT', 'MARKETPLACE', '', null])('rejects a client-supplied canalOrigen %p', async (canalOrigen) => {
    await register({ ...draft, canalOrigen }).expect(400); expect(calls).toEqual([]);
  });
  it.each([{ confirmacion: PASSWORD }, { confirmarContrasena: PASSWORD }, { id: UUID }, { customerId: UUID }, { returnUrl: 'https://evil.test' },
    { redirect: '/x' }, { estado: 'ACTIVA' }, { roles: ['ADMIN'] }])('rejects extra field %j without contacting G7 or echoing the password', async (extra) => {
    const response = await register({ ...draft, ...extra }).expect(400); expect(calls).toEqual([]); noSecrets(response);
  });
  it.each([
    ['bad e-mail', { correo: 'no-at' }], ['e-mail with spaces', { correo: ' a@fixture.test ' }], ['e-mail > 254', { correo: `${'a'.repeat(250)}@fixture.test` }],
    ['empty password', { contrasena: '' }], ['password > 256', { contrasena: 'x'.repeat(257) }], ['non-string password', { contrasena: 123456 }],
    ['blank first name', { nombres: '   ' }], ['name > 100', { nombres: 'n'.repeat(101) }], ['blank last name', { apellidos: '' }],
    ['phone without +51', { celular: '900000000' }], ['phone too short', { celular: '+5190000000' }], ['phone with letters', { celular: '+51abcdefghi' }],
    ['terms false', { aceptaTerminos: false }], ['terms as string', { aceptaTerminos: 'true' }], ['terms as 1', { aceptaTerminos: 1 }], ['terms missing', { aceptaTerminos: undefined }],
    ['e-mail as array', { correo: ['a@fixture.test'] }], ['e-mail as object', { correo: { $ne: null } }],
  ])('validates locally: %s → 400, no G7 call, password never echoed', async (_name, patch) => {
    const response = await register({ ...draft, ...patch }).expect(400); expect(calls).toEqual([]); noSecrets(response);
  });
  it('rejects an empty body', async () => { await register({}).expect(400); expect(calls).toEqual([]); });
  it('rejects non-object bodies and malformed JSON without echoing them', async () => {
    await register([]).expect(400); await register('texto').expect(400);
    const bad = await request(app.getHttpServer()).post('/api/v1/auth/registro').set('Origin', origin).set('Content-Type', 'application/json')
      .send(`{"correo":"leak.person@fixture.test","contrasena":"${PASSWORD}",`);
    expect(bad.status).toBe(400); expect(bad.text).not.toContain('leak.person'); noSecrets(bad); expect(calls).toEqual([]);
  });
  it('requires the exact Marketplace Origin before contacting G7', async () => {
    await register(draft, null).expect(403); await register(draft, 'https://evil.test').expect(403);
    await register(draft, `${origin}.evil.test`).expect(403); await register(draft, 'null').expect(403); expect(calls).toEqual([]);
  });
  it('fails closed (503, no G7 call) while registration is not enabled, and when the whole auth feature is off', async () => {
    settings.G7_REGISTRATION_ENABLED = 'false'; let r = await register(draft).expect(503);
    expect(r.body.code).toBe('AUTH_OPERATION_UNAVAILABLE');
    settings.G7_REGISTRATION_ENABLED = 'true'; settings.AUTH_ENABLED = 'false';
    try { r = await register(draft).expect(503); } finally { settings.AUTH_ENABLED = 'true'; }
    expect(calls).toEqual([]);
    for (const v of ['TRUE', '1', 'yes', true]) { settings.G7_REGISTRATION_ENABLED = v; await register(draft).expect(503); }
    expect(calls).toEqual([]);
  });
  it('creates no session and leaves an existing session cookie untouched (no implicit login)', async () => {
    const response = await register(draft, origin, 'g1_session=abc').expect(201);
    expect(response.headers['set-cookie']).toBeUndefined(); expect(JSON.stringify(response.body)).not.toMatch(/token|sesion|session|authenticated/i);
  });
  it('never forwards provider tokens, links or extra fields from a 201', async () => {
    mode = 'tokens'; const response = await register(draft).expect(201);
    expect(response.body).toEqual({ id: UUID, estado: 'PENDIENTE_VERIFICACION' }); noSecrets(response);
  });
  it.each(['bad-id', 'bad-state'] as const)('does not infer acceptance from a malformed 201 (%s)', async (m) => {
    mode = m; const response = await register(draft).expect(503); expect(response.body.code).toBe('AUTH_UNAVAILABLE');
  });
  it('409 uses a neutral code and message, never the provider text, e-mail or password', async () => {
    mode = 'conflict'; const response = await register(draft).expect(409);
    expect(response.body.code).toBe('CORREO_NO_DISPONIBLE'); expect(response.text).not.toContain(draft.correo); noSecrets(response);
  });
  it('degrades an unknown 409 code (e.g. one that reveals a verified account) to a neutral 503', async () => {
    mode = 'unknown409'; const response = await register(draft).expect(503);
    expect(response.text).not.toMatch(/CUENTA_EXISTE|new\.person/);
  });
  it('422 policy errors keep only the contract code', async () => {
    mode = 'weak'; const response = await register(draft).expect(422);
    expect(response.body.code).toBe('POLITICA_INCUMPLIDA'); noSecrets(response);
  });
  it('provider 400 VALIDACION keeps only the contract code and never echoes e-mail or password', async () => {
    mode = 'v400'; const response = await register(draft).expect(400);
    expect(response.body.code).toBe('VALIDACION'); expect(response.text).not.toContain(draft.correo); noSecrets(response);
  });
  it('provider 500 and timeout give a generic 503 with no retry and no secrets in response or logs', async () => {
    mode = 'echo500'; let response = await register(draft).expect(503); noSecrets(response); expect(response.text).not.toContain(draft.correo);
    calls.length = 0; mode = 'hang'; const started = Date.now();
    response = await register(draft).expect(503);
    expect(Date.now() - started).toBeLessThan(2500); expect(calls).toHaveLength(1); expect(response.body.code).toBe('AUTH_UNAVAILABLE'); noSecrets(response);
  });
  it('never logs the password, e-mail or provider tokens on any path', async () => {
    await register(draft); await register({ ...draft, celular: 'x' });
    for (const m of ['conflict', 'weak', 'v400', 'echo500', 'tokens', 'bad-id', 'hang'] as const) { mode = m; await register(draft); }
    noSecrets(); expect(logged.join('\n')).not.toContain('new.person');
  });
});
