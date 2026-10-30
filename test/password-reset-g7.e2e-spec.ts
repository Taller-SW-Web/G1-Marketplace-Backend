import { ConsoleLogger, INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { createServer, ServerResponse, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { AccountController } from '../src/auth/account.controller';
import { AccountService } from '../src/auth/account.service';
import { G7Client } from '../src/auth/g7.client';
import { G7SessionService } from '../src/auth/g7-session.service';
import { SessionStore } from '../src/auth/session.store';
import { AuthGuard } from '../src/security/auth.guard';
import { configureApp } from '../src/http/configure-app';

// F-005 BFF reset adapter. G7 is an in-test HTTP double: this proves G1's adapter behavior
// against the documented contract, NOT G7 REAL behavior, email delivery or the G7 SPA form.
const origin = 'http://127.0.0.1:3000';
const secretToken = `tok-${randomBytes(12).toString('hex')}`;
const secretPassword = `Pw-${randomBytes(12).toString('hex')}!aA1`;
const sessionCookie = `g1_session=${randomBytes(32).toString('base64url')}`;
type Reply = (res: ServerResponse) => void;

describe('F-005 password reset BFF adapter (G7 contract double, not G7 REAL)', () => {
  let app: INestApplication; let server: Server;
  const calls: { path: string; body: Record<string, unknown>; headers: Record<string, unknown> }[] = [];
  const output: string[] = [];
  let reply: Reply = res => { res.statusCode = 204; res.end(); };
  const settings: Record<string, unknown> = { NODE_ENV: 'test', AUTH_ENABLED: 'true', G7_REGISTRATION_ENABLED: 'false',
    G7_RECOVERY_ENABLED: 'true', G1_WEB_ORIGIN: origin, HTTP_TIMEOUT_MS: 300 };
  const storage = { create: jest.fn(), remove: jest.fn(), locked: jest.fn() };

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      let raw = ''; for await (const chunk of req) raw += chunk;
      calls.push({ path: req.url!, body: JSON.parse(raw || '{}'), headers: req.headers });
      reply(res);
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
  beforeEach(() => {
    calls.length = 0; output.length = 0; jest.clearAllMocks(); settings.G7_RECOVERY_ENABLED = 'true';
    reply = res => { res.statusCode = 204; res.end(); };
  });
  afterEach(() => {
    // The adapter never creates, reads or rewrites a G1 session, and never leaks the secrets to logs.
    expect(storage.create).not.toHaveBeenCalled(); expect(storage.locked).not.toHaveBeenCalled(); expect(storage.remove).not.toHaveBeenCalled();
    expect(output.join('')).not.toContain(secretToken); expect(output.join('')).not.toContain(secretPassword);
  });
  afterAll(async () => { jest.restoreAllMocks(); await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

  const reset = (body: object = { token: secretToken, nuevaContrasena: secretPassword }) =>
    request(app.getHttpServer()).post('/api/v1/password/restablecer').set('Origin', origin).send(body);
  const expectClean = (response: request.Response) => {
    const seen = JSON.stringify([response.body, response.text, response.headers]);
    expect(seen).not.toContain(secretToken); expect(seen).not.toContain(secretPassword);
    expect(response.headers['cache-control']).toBe('no-store, private');
  };

  it('captures application logs, so the no-leak assertions are meaningful', () => {
    new Logger('canary').log('canary-line'); expect(output.join('')).toContain('canary-line');
  });
  it('204 is empty, sets no cookie and creates no implicit session even when a stale cookie is sent', async () => {
    const response = await reset().set('Cookie', sessionCookie).expect(204);
    expect(response.text).toBe(''); expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.headers.authorization).toBeUndefined(); expectClean(response);
    expect(calls).toHaveLength(1); expect(calls[0].path).toBe('/api/v1/password/restablecer');
    expect(calls[0].body).toEqual({ token: secretToken, nuevaContrasena: secretPassword });
    // Neither the browser cookie nor the client Origin travels to G7.
    expect(calls[0].headers.cookie).toBeUndefined(); expect(calls[0].headers.origin).toBeUndefined();
  });
  it.each([
    ['used or invalid token (provider 401)', 401, 'TOKEN_RECUPERACION_INVALIDO'],
    ['expired token (provider 410)', 410, 'TOKEN_RECUPERACION_EXPIRADO'],
    ['policy violation (provider 422)', 422, 'POLITICA_INCUMPLIDA'],
  ])('%s maps to a neutral contract error without provider detail or secrets', async (_name, status, code) => {
    reply = res => { res.statusCode = status; res.end(JSON.stringify({ code, detail: `echo ${secretToken} ${secretPassword} user@private.test`,
      error: { code, message: `account 11111111-1111-4111-8111-111111111111 ${secretPassword}` } })); };
    const response = await reset().expect(status);
    expect(Object.keys(response.body).sort()).toEqual(['code', 'message']); expect(response.body.code).toBe(code);
    expect(response.body.message).toBe('No pudimos completar el acceso.');
    expect(JSON.stringify(response.body)).not.toMatch(/private\.test|1111/); expectClean(response); expect(response.headers['set-cookie']).toBeUndefined();
  });
  it('the same token answered 204 and then 401 is surfaced per provider answer, never decided locally', async () => {
    await reset().expect(204);
    reply = res => { res.statusCode = 401; res.end(JSON.stringify({ code: 'TOKEN_RECUPERACION_INVALIDO' })); };
    const second = await reset().expect(401); expect(second.body.code).toBe('TOKEN_RECUPERACION_INVALIDO');
    expect(calls).toHaveLength(2);
  });
  it.each([
    ['unknown code on 401', 401, { code: 'SOMETHING_ELSE', detail: secretToken }, 401, 'TOKEN_RECUPERACION_INVALIDO'],
    ['login code on 401', 401, { code: 'CREDENCIALES_INVALIDAS' }, 401, 'TOKEN_RECUPERACION_INVALIDO'],
    ['OTP code on 410', 410, { code: 'OTP_EXPIRADO' }, 503, 'AUTH_UNAVAILABLE'],
    ['unknown code on 410', 410, { code: 'TOKEN_USADO_DESCONOCIDO' }, 503, 'AUTH_UNAVAILABLE'],
    ['unknown code on 422', 422, { code: 'OTRO', detail: secretPassword }, 503, 'AUTH_UNAVAILABLE'],
    ['provider 500 echoing secrets', 500, { code: 'ERROR', detail: `${secretToken} ${secretPassword}` }, 503, 'AUTH_UNAVAILABLE'],
    ['non-JSON error body', 502, `raw upstream html ${secretToken}`, 503, 'AUTH_UNAVAILABLE'],
  ])('fails closed on %s', async (_name, status, payload, expected, code) => {
    reply = res => { res.statusCode = status; res.end(typeof payload === 'string' ? payload : JSON.stringify(payload)); };
    const response = await reset().expect(expected); expectClean(response); expect(response.body.code).toBe(code);
    expect(response.body.message).toMatch(/No pudimos completar el acceso\.|Acceso no disponible temporalmente|Respuesta de acceso/);
  });
  it.each([
    ['200 with a body instead of 204', (res: ServerResponse) => { res.statusCode = 200; res.end(JSON.stringify({ accessToken: secretToken })); }],
    ['202 instead of 204', (res: ServerResponse) => { res.statusCode = 202; res.end(); }],
    ['redirect', (res: ServerResponse) => { res.statusCode = 302; res.setHeader('Location', `http://127.0.0.1:1/?t=${secretToken}`); res.end(); }],
    ['timeout', () => undefined],
  ])('does not confirm a reset on %s', async (_name, handler) => {
    reply = handler as Reply; const response = await reset().expect(503);
    expect(response.body.code).toBe('AUTH_UNAVAILABLE'); expectClean(response);
    expect(response.headers['set-cookie']).toBeUndefined();
  });
  it('forwards 429 only with a bounded numeric retry hint', async () => {
    reply = res => { res.statusCode = 429; res.setHeader('Retry-After', '7'); res.end(JSON.stringify({ code: 'RATE_LIMITED', detail: secretToken })); };
    const limited = await reset().expect(429); expect(limited.body).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 7 }); expectClean(limited);
    reply = res => { res.statusCode = 429; res.setHeader('Retry-After', 'Wed, 21 Oct 2026 07:28:00 GMT'); res.end('{}'); };
    expect((await reset().expect(429)).body.retryAfterSeconds).toBeUndefined();
  });
  it('validation errors never echo token or password and never contact G7', async () => {
    for (const body of [{}, { token: secretToken }, { nuevaContrasena: secretPassword }, { token: secretToken, nuevaContrasena: secretPassword, correo: 'x@y.test' },
      { token: 'x'.repeat(2049) + secretToken, nuevaContrasena: secretPassword }, { token: secretToken, nuevaContrasena: secretPassword.repeat(30) },
      { token: { secretToken }, nuevaContrasena: [secretPassword] }, { token: '', nuevaContrasena: '' }]) {
      expectClean(await reset(body).expect(400));
    }
    expect(calls).toEqual([]);
  });
  it('accepts the token only in the JSON body, never from the URL, and exposes no GET variant', async () => {
    await request(app.getHttpServer()).post(`/api/v1/password/restablecer?token=${secretToken}`).set('Origin', origin).send({ nuevaContrasena: secretPassword }).expect(400);
    const get = await request(app.getHttpServer()).get(`/api/v1/password/restablecer?token=${secretToken}`).expect(404);
    expect(JSON.stringify(get.body)).not.toContain(secretToken);
    expect(calls).toEqual([]);
  });
  it('rejects missing, foreign and cross-site origins and a disabled gate before contacting G7', async () => {
    const send = () => request(app.getHttpServer()).post('/api/v1/password/restablecer').send({ token: secretToken, nuevaContrasena: secretPassword });
    expectClean(await send().expect(403));
    expectClean(await send().set('Origin', 'https://evil.test').expect(403));
    expectClean(await send().set('Origin', origin).set('Sec-Fetch-Site', 'cross-site').expect(403));
    settings.G7_RECOVERY_ENABLED = 'false';
    const gated = await reset().expect(503); expect(gated.body.code).toBe('AUTH_OPERATION_UNAVAILABLE'); expectClean(gated);
    expect(calls).toEqual([]);
  });
});
