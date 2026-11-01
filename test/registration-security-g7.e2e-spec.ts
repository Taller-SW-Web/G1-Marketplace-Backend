import { ConsoleLogger, INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { createServer, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { AccountController } from '../src/auth/account.controller';
import { AccountService } from '../src/auth/account.service';
import { G7Client } from '../src/auth/g7.client';
import { G7SessionService } from '../src/auth/g7-session.service';
import { SessionStore } from '../src/auth/session.store';
import { AuthGuard } from '../src/security/auth.guard';
import { configureApp } from '../src/http/configure-app';

// F-001 registration BFF, security negatives. G7 is an in-test HTTP double, NOT G7 REAL.
// Not covered here: SAST/secrets scanners, DAST, real G7 behavior, email delivery, the G7/G1 UI.
const origin = 'http://127.0.0.1:3000';
const secretPassword = `Pw-${randomBytes(12).toString('hex')}!aA1`;
const email = `user-${randomBytes(6).toString('hex')}@fixture.test`;
const draft = { correo: email, contrasena: secretPassword, nombres: 'Cuenta Prueba', apellidos: 'Local', celular: '+51900000000', aceptaTerminos: true };
const id = '11111111-1111-4111-8111-111111111111';
type Reply = (res: ServerResponse, body: Record<string, unknown>) => void;
const created: Reply = res => { res.statusCode = 201; res.end(JSON.stringify({ id, estado: 'PENDIENTE_VERIFICACION' })); };

describe('F-001 registration BFF security negatives (G7 contract double, not G7 REAL)', () => {
  let app: INestApplication; let server: Server;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const output: string[] = [];
  let reply: Reply = created;
  const settings: Record<string, unknown> = { NODE_ENV: 'test', AUTH_ENABLED: 'true', G7_REGISTRATION_ENABLED: 'true',
    G7_RECOVERY_ENABLED: 'false', G1_WEB_ORIGIN: origin, HTTP_TIMEOUT_MS: 300 };
  const storage = { create: jest.fn(), remove: jest.fn(), locked: jest.fn() };

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '{}'); calls.push({ path: req.url!, body });
      reply(res, body);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    settings.G7_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const config = { get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
      getOrThrow: (key: string) => { if (settings[key] === undefined) throw new Error('Missing fixture setting'); return settings[key]; } };
    const module = await Test.createTestingModule({ controllers: [AccountController], providers: [AccountService, G7Client,
      G7SessionService, AuthGuard, { provide: ConfigService, useValue: config }, { provide: SessionStore, useValue: storage }] }).compile();
    app = module.createNestApplication(); configureApp(app);
    app.useLogger(new ConsoleLogger()); await app.init();
    for (const stream of [process.stdout, process.stderr]) {
      const write = stream.write.bind(stream);
      jest.spyOn(stream, 'write').mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
        output.push(String(chunk)); return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
      }) as typeof stream.write);
    }
  });
  beforeEach(() => { calls.length = 0; output.length = 0; jest.clearAllMocks(); reply = created; settings.G7_REGISTRATION_ENABLED = 'true'; });
  afterEach(() => {
    expect(storage.create).not.toHaveBeenCalled(); expect(storage.locked).not.toHaveBeenCalled(); expect(storage.remove).not.toHaveBeenCalled();
    expect(output.join('')).not.toContain(secretPassword); expect(output.join('')).not.toContain(email);
  });
  afterAll(async () => { jest.restoreAllMocks(); await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

  const register = (body: object = draft) => request(app.getHttpServer()).post('/api/v1/auth/registro').set('Origin', origin).send(body);
  const clean = (response: request.Response) => {
    const seen = JSON.stringify([response.body, response.text, response.headers]);
    expect(seen).not.toContain(secretPassword); expect(seen).not.toContain(email);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.headers['set-cookie']).toBeUndefined();
  };

  it('captures application logs, so the no-leak assertions are meaningful', () => {
    new Logger('canary').log('canary-line'); expect(output.join('')).toContain('canary-line');
  });
  it('success returns only id and pending state, no session, and sends the fixed channel without secrets in headers', async () => {
    reply = res => { res.statusCode = 201; res.end(JSON.stringify({ id, estado: 'PENDIENTE_VERIFICACION', accessToken: 'x', correo: email, verificationLink: 'https://g7.test/v?t=x' })); };
    const response = await register().expect(201); clean(response);
    expect(response.body).toEqual({ id, estado: 'PENDIENTE_VERIFICACION' });
    expect(calls[0].body.canalOrigen).toBe('MARKETPLACE');
  });
  it('409 is a fixed neutral error: same shape and message as any other registration rejection, no provider data', async () => {
    reply = res => { res.statusCode = 409; res.end(JSON.stringify({ code: 'CORREO_NO_DISPONIBLE', detail: `${email} exists`, userId: id })); };
    const conflict = await register().expect(409); clean(conflict);
    expect(Object.keys(conflict.body).sort()).toEqual(['code', 'message']);
    expect(conflict.body.message).toBe('No pudimos completar el acceso.'); expect(JSON.stringify(conflict.body)).not.toContain(id);
    reply = res => { res.statusCode = 422; res.end(JSON.stringify({ code: 'POLITICA_INCUMPLIDA' })); };
    const weak = await register().expect(422); expect(weak.body.message).toBe(conflict.body.message);
  });
  it.each([
    ['409 with unknown code', 409, { code: 'USUARIO_EXISTE', detail: email }, 503],
    ['422 with unknown code', 422, { code: 'X', detail: secretPassword }, 503],
    ['403 PASSWORD_CADUCADA is not a registration answer but stays neutral', 403, { code: 'PASSWORD_CADUCADA' }, 403],
    ['500 echoing data', 500, { code: 'ERR', detail: `${email} ${secretPassword}` }, 503],
    ['HTML error', 502, `<html>${email}</html>`, 503],
  ])('fails closed on %s', async (_name, status, payload, expected) => {
    reply = res => { res.statusCode = status; res.end(typeof payload === 'string' ? payload : JSON.stringify(payload)); };
    const response = await register().expect(expected); clean(response);
  });
  it('429 exposes only a bounded numeric retry hint', async () => {
    reply = res => { res.statusCode = 429; res.setHeader('Retry-After', '99999999'); res.end(JSON.stringify({ code: 'RATE_LIMITED', detail: email })); };
    const response = await register().expect(429); clean(response); expect(response.body.retryAfterSeconds).toBeUndefined();
  });
  it.each([
    ['wrong state', { id, estado: 'ACTIVO' }],
    ['non-UUID id', { id: 'not-a-uuid', estado: 'PENDIENTE_VERIFICACION' }],
    ['array', []],
    ['missing id', { estado: 'PENDIENTE_VERIFICACION' }],
  ])('does not report registration on malformed provider success (%s)', async (_name, payload) => {
    reply = res => { res.statusCode = 201; res.end(JSON.stringify(payload)); };
    clean(await register().expect(503));
  });
  it('channel, return URL and every client-chosen control field are impossible to inject', async () => {
    const extras: object[] = [{ canalOrigen: 'CHATBOT' }, { canal: 'WEB' }, { returnUrl: 'https://evil.test' }, { returnURL: 'https://evil.test' },
      { redirectUrl: 'https://evil.test' }, { callbackUrl: 'https://evil.test' }, { estado: 'ACTIVO' }, { roles: ['ADMIN'] }, { id }];
    for (const extra of extras) clean(await register({ ...draft, ...extra }).expect(400));
    // Prototype and parsing tricks must not smuggle fields either.
    await request(app.getHttpServer()).post('/api/v1/auth/registro').set('Origin', origin).set('Content-Type', 'application/json')
      .send(`{"correo":"${email}","contrasena":"${secretPassword}","nombres":"A","apellidos":"B","celular":"+51900000000","aceptaTerminos":true,"__proto__":{"canalOrigen":"CHATBOT"}}`).then(r => {
        if (r.status === 201) expect(calls[0].body.canalOrigen).toBe('MARKETPLACE'); else expect(r.status).toBe(400);
      });
    await request(app.getHttpServer()).post('/api/v1/auth/registro?canalOrigen=CHATBOT&returnUrl=https://evil.test').set('Origin', origin).send(draft).expect(201);
    expect(calls.at(-1)!.body.canalOrigen).toBe('MARKETPLACE'); expect(JSON.stringify(calls.at(-1)!.body)).not.toContain('evil');
    await request(app.getHttpServer()).post('/api/v1/auth/registro').set('Origin', origin).set('Content-Type', 'application/x-www-form-urlencoded')
      .send('canalOrigen=CHATBOT').then(r => expect(r.status).toBeGreaterThanOrEqual(400));
  });
  it('the BFF never decides password policy locally: it forwards verbatim and relies on the provider 422', async () => {
    reply = (res, body) => { res.statusCode = body.contrasena === 'a' ? 422 : 201; res.end(JSON.stringify(body.contrasena === 'a' ? { code: 'POLITICA_INCUMPLIDA' } : { id, estado: 'PENDIENTE_VERIFICACION' })); };
    expect((await register({ ...draft, contrasena: 'a' }).expect(422)).body.code).toBe('POLITICA_INCUMPLIDA');
    await register({ ...draft, contrasena: '  spaced  ' }).expect(201); expect(calls.at(-1)!.body.contrasena).toBe('  spaced  ');
    await register({ ...draft, contrasena: 'x'.repeat(257) }).expect(400); await register({ ...draft, contrasena: '' }).expect(400);
  });
  it('validation errors never echo password or email and never reach G7', async () => {
    for (const body of [{ ...draft, correo: `not-an-email-${secretPassword}` }, { ...draft, contrasena: 5 }, { ...draft, aceptaTerminos: 'true' },
      { ...draft, celular: secretPassword }, { ...draft, nombres: 'x'.repeat(101) }, { ...draft, correo: `${'a'.repeat(250)}@${email}` }, null, []]) {
      clean(await register(body as object).expect(400));
    }
    expect(calls).toEqual([]);
  });
  it('rejects missing, foreign and cross-site origins and the disabled gate before contacting G7', async () => {
    const send = () => request(app.getHttpServer()).post('/api/v1/auth/registro').send(draft);
    clean(await send().expect(403)); clean(await send().set('Origin', 'https://evil.test').expect(403));
    clean(await send().set('Origin', origin).set('Sec-Fetch-Site', 'cross-site').expect(403));
    settings.G7_REGISTRATION_ENABLED = 'false'; clean(await register().expect(503));
    expect(calls).toEqual([]);
  });
  it('capabilities and policy expose no account data and do not require or create a session', async () => {
    const capabilities = await request(app.getHttpServer()).get('/api/v1/auth/capabilities').expect(200);
    expect(Object.keys(capabilities.body).sort()).toEqual(['login', 'recuperacion', 'registro']);
    expect(capabilities.headers['cache-control']).toBe('no-store, private');
  });
});
