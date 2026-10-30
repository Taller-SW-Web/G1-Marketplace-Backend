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

// F-004 BFF recovery QA. G7 is a local HTTP double: nothing here proves real G7 behavior,
// real e-mail delivery, G7's own rate limit, or response timing of the real provider.
const origin = 'http://127.0.0.1:3000';
const KNOWN = 'known.person@fixture.test';
const UNKNOWN = 'nobody.here@fixture.test';
const RESET_TOKEN = 'reset-token-fixture-0123456789';

describe('F-004 recovery BFF QA (G7 double, full HTTP pipeline)', () => {
  let app: INestApplication; let server: Server;
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  let mode: 'ok' | 'hang' | 'echo500' | 'wrong200' | 'g7-400' | 'g7-404' | 'rate-bad' = 'ok';
  let g7DelayMs = 0;
  const settings: Record<string, unknown> = { NODE_ENV: 'test', AUTH_ENABLED: 'true', G7_RECOVERY_ENABLED: 'true',
    G7_REGISTRATION_ENABLED: 'false', G1_WEB_ORIGIN: origin, HTTP_TIMEOUT_MS: 300, CORS_ORIGINS: [origin] };
  const storage = { create: jest.fn(), remove: jest.fn(), locked: jest.fn() };
  const logged: string[] = [];

  beforeAll(async () => {
    for (const level of ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => { logged.push(JSON.stringify(args, (_k, v) => v instanceof Error ? `${v.message}\n${v.stack}` : v)); });
      jest.spyOn(Logger, level).mockImplementation((...args: unknown[]) => { logged.push(JSON.stringify(args)); });
    }
    for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) {
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => { logged.push(JSON.stringify(args)); });
    }
    for (const stream of [process.stdout, process.stderr]) {
      const write = stream.write.bind(stream);
      jest.spyOn(stream, 'write').mockImplementation(((chunk: unknown, ...rest: unknown[]) => {
        const text = String(chunk); if (!/^\s*(PASS|FAIL|\s*✓|\s*✕)/.test(text)) logged.push(text);
        return (write as (...a: unknown[]) => boolean)(chunk, ...rest);
      }) as never);
    }
    server = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw || '{}'); calls.push({ path: req.url!, body });
      if (mode === 'hang') return;
      if (g7DelayMs) await new Promise(resolve => setTimeout(resolve, g7DelayMs));
      const send = (status: number, value?: unknown) => { res.statusCode = status; res.end(value === undefined ? undefined : JSON.stringify(value)); };
      if (req.url === '/api/v1/password/recuperar') {
        if (mode === 'echo500') return send(500, { message: `failed for ${body.correo}`, detail: `stack for ${body.correo}` });
        if (mode === 'wrong200') return send(200, { enviado: body.correo === KNOWN });
        if (mode === 'g7-400') return send(400, { code: 'VALIDACION', message: `bad ${body.correo}` });
        if (mode === 'g7-404') return send(404, { code: 'CUENTA_NO_ENCONTRADA', message: body.correo });
        if (body.correo === 'limit@fixture.test') {
          res.setHeader('Retry-After', mode === 'rate-bad' ? 'Wed, 21 Oct 2026 07:28:00 GMT' : '7');
          return send(429, { code: 'DEMASIADAS_SOLICITUDES', message: 'ip 10.1.2.3 correo limit@fixture.test' });
        }
        return send(202);
      }
      if (req.url === '/api/v1/password/restablecer') return send(401, { code: 'TOKEN_RECUPERACION_INVALIDO', message: `token ${body.token}` });
      send(404, { code: 'NO_ENCONTRADO' });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    settings.G7_API_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
    const config = { get: (key: string, fallback?: unknown) => settings[key] ?? fallback,
      getOrThrow: (key: string) => { if (settings[key] === undefined) throw new Error('Missing fixture setting'); return settings[key]; } };
    const module = await Test.createTestingModule({ controllers: [AccountController], providers: [AccountService, G7Client,
      G7SessionService, AuthGuard, { provide: ConfigService, useValue: config }, { provide: SessionStore, useValue: storage }] }).compile();
    app = module.createNestApplication({ logger: false }); configureApp(app); await app.init();
  });
  beforeEach(() => { calls.length = 0; logged.length = 0; mode = 'ok'; g7DelayMs = 0; settings.G7_RECOVERY_ENABLED = 'true'; jest.clearAllMocks(); });
  afterEach(() => { expect(storage.create).not.toHaveBeenCalled(); expect(storage.locked).not.toHaveBeenCalled(); });
  afterAll(async () => { jest.restoreAllMocks(); await app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });

  const recover = (body: unknown, from: string | null = origin) => {
    const r = request(app.getHttpServer()).post('/api/v1/password/recuperar'); if (from) r.set('Origin', from);
    return r.send(body as object);
  };
  const raw = (text: string) => request(app.getHttpServer()).post('/api/v1/password/recuperar').set('Origin', origin)
    .set('Content-Type', 'application/json').send(text);
  const stable = (response: request.Response) => ({ status: response.status, text: response.text, cache: response.headers['cache-control'],
    cookies: response.headers['set-cookie'], type: response.headers['content-type'], location: response.headers.location });
  const expectNoLeak = (...secrets: string[]) => {
    const everything = logged.join('\n');
    for (const secret of secrets) expect(everything).not.toContain(secret);
  };

  describe('uniform 202 / anti-enumeration', () => {
    it('answers known and unknown e-mails identically (status, body, headers) and forwards only the e-mail', async () => {
      const a = await recover({ correo: KNOWN }); const b = await recover({ correo: UNKNOWN });
      expect(a.status).toBe(202);
      expect(stable(a)).toEqual(stable(b)); expect(a.text).toBe(''); expect(a.headers['set-cookie']).toBeUndefined();
      expect(String(a.headers['cache-control'])).toContain('no-store');
      expect(calls.map(c => c.body)).toEqual([{ correo: KNOWN }, { correo: UNKNOWN }]);
      expectNoLeak(KNOWN, UNKNOWN);
    });
    it('does not turn a differing provider answer (200 with a "sent" flag) into a per-account response', async () => {
      mode = 'wrong200';
      const a = await recover({ correo: KNOWN }); const b = await recover({ correo: UNKNOWN });
      expect(stable(a)).toEqual(stable(b)); expect(a.status).toBe(503);
      expect(a.text).not.toMatch(/enviado|true|false/);
    });
    it.each(['g7-400', 'g7-404', 'echo500'] as const)('collapses provider answer %s to a generic body that never echoes the e-mail or provider text', async (m) => {
      mode = m; const response = await recover({ correo: KNOWN });
      expect(response.text).not.toContain(KNOWN); expect(response.text).not.toMatch(/CUENTA_NO_ENCONTRADA|stack for|bad /);
      expectNoLeak(KNOWN);
    });
    it('keeps unknown-account responses identical for every non-202 provider mode (same for known and unknown)', async () => {
      for (const m of ['g7-400', 'g7-404', 'echo500', 'wrong200'] as const) {
        mode = m; const a = await recover({ correo: KNOWN }); const b = await recover({ correo: UNKNOWN });
        expect(stable(a)).toEqual(stable(b));
      }
    });
    it('adds no per-account work or latency of its own (median overhead known vs unknown, constant provider delay)', async () => {
      g7DelayMs = 25;
      const time = async (correo: string) => { const t = process.hrtime.bigint(); await recover({ correo }).expect(202); return Number(process.hrtime.bigint() - t) / 1e6; };
      const median = (values: number[]) => values.sort((x, y) => x - y)[Math.floor(values.length / 2)];
      await time(KNOWN); await time(UNKNOWN);
      const known: number[] = []; const unknown: number[] = [];
      for (let i = 0; i < 15; i++) { known.push(await time(KNOWN)); unknown.push(await time(UNKNOWN)); }
      // Local double only: bounds BFF-induced skew, says nothing about G7's own timing.
      expect(Math.abs(median(known) - median(unknown))).toBeLessThan(40);
      expect(calls.length).toBe(32);
    });
  });

  describe('invalid format and request hygiene', () => {
    it.each([[{}], [{ correo: '' }], [{ correo: 'not-an-email' }], [{ correo: 'a@' }], [{ correo: 123 }], [{ correo: ['a@fixture.test'] }],
      [{ correo: { $ne: null } }], [{ correo: null }], [{ correo: `${'a'.repeat(250)}@fixture.test` }], [{ correo: ' a@fixture.test ' }],
      [{ correo: KNOWN, returnUrl: 'https://evil.test' }], [{ correo: KNOWN, redirect: '/x' }], [[]], ['text']])(
      'rejects %j with 400 without contacting G7 or setting cookies', async (body) => {
        const response = await recover(body).expect(400);
        expect(calls).toEqual([]); expect(response.headers['set-cookie']).toBeUndefined();
        expect(response.headers.location).toBeUndefined();
      });
    it('is the same 400 body whether or not the (invalid) address looks like a known one', async () => {
      const a = await recover({ correo: 'known.person@fixture' }).expect(400); const b = await recover({ correo: 'nobody.here@fixture' }).expect(400);
      expect(a.text.replace(/known\.person|nobody\.here/g, '')).toBe(b.text.replace(/known\.person|nobody\.here/g, ''));
    });
    it('does not echo the submitted value in validation errors', async () => {
      const response = await recover({ correo: 'secret.person@not-valid' }).expect(400);
      expect(response.text).not.toContain('secret.person'); expectNoLeak('secret.person');
    });
    it('does not echo a malformed JSON body (which may contain an e-mail) in the response or logs', async () => {
      const response = await raw('{"correo":"leaky.person@fixture.test",').expect(400);
      expect(response.text).not.toContain('leaky.person'); expectNoLeak('leaky.person');
      expect(calls).toEqual([]);
    });
    it('rejects non-JSON content types and oversized bodies without echoing them', async () => {
      const form = await request(app.getHttpServer()).post('/api/v1/password/recuperar').set('Origin', origin)
        .set('Content-Type', 'text/plain').send('correo=form.person@fixture.test');
      expect(form.status).toBeGreaterThanOrEqual(400); expect(form.status).toBeLessThan(500); expect(form.text).not.toContain('form.person');
      const big = await recover({ correo: KNOWN, padding: 'x'.repeat(200_000) });
      expect([400, 413]).toContain(big.status); expect(big.text).not.toContain(KNOWN);
      expect(calls).toEqual([]); expectNoLeak('form.person');
    });
    it('requires the exact Marketplace Origin (missing, foreign and sibling origins) before contacting G7', async () => {
      await recover({ correo: KNOWN }, null).expect(403);
      await recover({ correo: KNOWN }, 'https://evil.test').expect(403);
      await recover({ correo: KNOWN }, `${origin}.evil.test`).expect(403);
      await recover({ correo: KNOWN }, 'null').expect(403);
      expect(calls).toEqual([]);
    });
    it('keeps the operation gated off (503, no G7 call) until G7_RECOVERY_ENABLED', async () => {
      settings.G7_RECOVERY_ENABLED = 'false';
      const response = await recover({ correo: KNOWN }).expect(503);
      expect(response.body.code).toBe('AUTH_OPERATION_UNAVAILABLE'); expect(calls).toEqual([]);
    });
    it('rejects GET and other verbs on the recovery path', async () => {
      const r = await request(app.getHttpServer()).get('/api/v1/password/recuperar?correo=' + KNOWN);
      expect(r.status).toBe(404); expect(calls).toEqual([]); expect(r.text).not.toContain(KNOWN);
    });
  });

  describe('neutral 429', () => {
    it('surfaces a neutral 429 with bounded retry data and no provider text, IP or e-mail', async () => {
      const response = await recover({ correo: 'limit@fixture.test' }).expect(429);
      expect(response.body).toEqual({ code: 'DEMASIADAS_SOLICITUDES', message: 'Espera antes de volver a solicitar instrucciones.', retryAfterSeconds: 7 });
      expect(response.text).not.toMatch(/10\.1\.2\.3|limit@fixture/); expect(response.headers['set-cookie']).toBeUndefined();
      expectNoLeak('limit@fixture.test', '10.1.2.3');
    });
    it('omits retryAfterSeconds when the provider interval is not a plain bounded integer', async () => {
      mode = 'rate-bad'; const response = await recover({ correo: 'limit@fixture.test' }).expect(429);
      expect(response.body.retryAfterSeconds).toBeUndefined(); expect(response.body.code).toBe('DEMASIADAS_SOLICITUDES');
    });
    it('does not retry automatically after a 429', async () => {
      await recover({ correo: 'limit@fixture.test' }).expect(429); expect(calls).toHaveLength(1);
    });
  });

  describe('timeout and provider failure', () => {
    it('gives a generic 503 within the configured timeout, with no retry and no e-mail in response or logs', async () => {
      mode = 'hang'; const started = Date.now();
      const response = await recover({ correo: KNOWN }).expect(503);
      expect(Date.now() - started).toBeLessThan(2500);
      expect(response.body.code).toBe('AUTH_UNAVAILABLE'); expect(response.text).not.toContain(KNOWN);
      expect(calls).toHaveLength(1); expectNoLeak(KNOWN);
    });
    it('gives the same 503 for known and unknown accounts on timeout (no timing-based existence signal in the status)', async () => {
      mode = 'hang';
      const a = await recover({ correo: KNOWN }); const b = await recover({ correo: UNKNOWN });
      expect(stable(a)).toEqual(stable(b));
    });
  });

  describe('logs', () => {
    it('never logs the e-mail or the reset token on success, failure or timeout paths', async () => {
      await recover({ correo: KNOWN }); await recover({ correo: 'bad-address' });
      mode = 'echo500'; await recover({ correo: UNKNOWN });
      mode = 'hang'; await recover({ correo: 'timeout.person@fixture.test' });
      await request(app.getHttpServer()).post('/api/v1/password/restablecer').set('Origin', origin).send({ token: RESET_TOKEN, nuevaContrasena: 'New-fixture!123' });
      await request(app.getHttpServer()).post('/api/v1/password/restablecer').set('Origin', origin).send({ token: RESET_TOKEN });
      expectNoLeak(KNOWN, UNKNOWN, 'timeout.person', 'bad-address', RESET_TOKEN, 'New-fixture!123');
    });
    it('does not echo the reset token or new password in reset error responses', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/password/restablecer').set('Origin', origin)
        .send({ token: RESET_TOKEN, nuevaContrasena: 'New-fixture!123' }).expect(401);
      expect(response.text).not.toContain(RESET_TOKEN); expect(response.body.code).toBe('TOKEN_RECUPERACION_INVALIDO');
    });
  });
});
