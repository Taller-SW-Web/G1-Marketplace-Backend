import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_REQUESTS, assertClean, configure, limaTime, renderMarkdown, run, throwawayPassword,
} from '../scripts/bff-integration-real.mjs';

// MOCK sin red: un doble del BFF con sesión por cookie, igual que el controlador real.
const WEB = 'https://web.example';
const env = {
  BFF_MODE: 'real', BFF_REAL_AUTHORIZED: '1', BFF_WEB_ORIGIN: WEB,
  BFF_EMAIL: 'cliente@example.invalid', BFF_PASSWORD: 'Clave-del-doble-1',
  BFF_UNKNOWN_EMAIL: 'desconocido@example.invalid', BFF_PHONE: '+51900000000',
};
const config = {
  mode: 'MOCK', base: 'http://127.0.0.1:10000/api/v1', host: '127.0.0.1:10000', webOrigin: WEB,
  credentials: {
    email: env.BFF_EMAIL, password: env.BFF_PASSWORD, unknownEmail: env.BFF_UNKNOWN_EMAIL, phone: env.BFF_PHONE,
  },
};
const USER = '11111111-1111-4111-8111-111111111111';
const COOKIE = '__Host-g1_session';
const CHALLENGE = '__Host-g1_challenge';

function fakeBff(overrides = {}) {
  const sessions = new Set();
  const addresses = [];
  const calls = [];
  let counter = 0;
  const request = async (url, options) => {
    const path = new URL(url).pathname.replace('/api/v1', '');
    const key = options.method + ' ' + path;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ key, headers: options.headers, body });
    const cookie = /(?:^|; )__Host-g1_session=([^;]+)/.exec(options.headers.Cookie ?? '')?.[1];
    const challenge = /(?:^|; )__Host-g1_challenge=([^;]+)/.exec(options.headers.Cookie ?? '')?.[1];
    const headers = new Headers({ 'X-Request-Id': options.headers['X-Request-Id'] });
    const reply = (data, status = 200) => new Response(data === undefined ? null : JSON.stringify(data), { status, headers });
    const set = (name, value) => headers.append('Set-Cookie', name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (value ? 604800 : 0) + '; Secure');
    if (overrides[key]) return overrides[key]({ reply, set, body, calls });
    const mutation = options.method !== 'GET';
    if (mutation && options.headers.Origin !== WEB) return reply({ code: 'FORBIDDEN', message: 'Realiza esta operación desde Marketplace.' }, 403);
    switch (key) {
      case 'GET /auth/capabilities': return reply({ login: true, registro: true, recuperacion: true });
      case 'GET /password/politica': return reply({ longitudMinima: 12, requiereMayuscula: true, requiereMinuscula: true,
        requiereDigito: true, requiereCaracterEspecial: true, historial: 5 });
      case 'POST /auth/registro':
        if (body.correo === env.BFF_EMAIL) return reply({ code: 'CORREO_NO_DISPONIBLE', message: 'No pudimos completar el acceso.' }, 409);
        return reply({ id: '22222222-2222-4222-8222-222222222222', estado: 'PENDIENTE_VERIFICACION' }, 201);
      case 'POST /auth/login':
        set(COOKIE, ''); set(CHALLENGE, '');
        if (body.correo === 'mfa@example.invalid') {
          set(CHALLENGE, 'desafio-del-doble-' + ++counter);
          return reply({ mfaRequerido: true, canal: 'EMAIL', expiraEn: 300 });
        }
        if (body.contrasena !== env.BFF_PASSWORD) return reply({ code: 'CREDENCIALES_INVALIDAS', message: 'No pudimos completar el acceso.' }, 401);
        {
          const opaque = 'opaco-del-doble-' + ++counter;
          sessions.add(opaque); set(COOKIE, opaque);
          return reply({ authenticated: true, user: { id: USER, nombreCompleto: 'Persona Doble', roles: ['CLIENTE'] }, scope: 'x' });
        }
      case 'POST /auth/otp/solicitar': return challenge ? reply({ canal: 'EMAIL', destinoEnmascarado: 'm***@example.invalid', expiraEn: 300, desafioExpiraEn: 600 })
        : reply({ code: 'OTP_EXPIRADO', message: 'Vuelve a iniciar sesión.' }, 410);
      case 'POST /auth/otp/verificar': {
        if (!challenge || body.codigo !== '123456') return reply({ code: 'CODIGO_INVALIDO', message: 'x' }, 401);
        const opaque = 'opaco-mfa-' + ++counter;
        sessions.add(opaque); set(COOKIE, opaque); set(CHALLENGE, '');
        return reply({ authenticated: true, user: { id: USER, nombreCompleto: 'Persona Doble', roles: ['CLIENTE'] }, scope: 'y' });
      }
      case 'GET /auth/session':
        return sessions.has(cookie) ? reply({ authenticated: true, user: { id: USER, roles: ['CLIENTE'] }, scope: 'x' })
          : reply({ authenticated: false, scope: 'anonymous' });
      case 'POST /auth/refresh':
        return sessions.has(cookie) ? reply({ authenticated: true }) : reply({ code: 'UNAUTHORIZED', message: 'Inicia sesión para continuar.' }, 401);
      case 'POST /auth/logout':
        sessions.delete(cookie); set(COOKIE, ''); set(CHALLENGE, '');
        return reply({ authenticated: false, remoteRevocationPending: false });
      case 'GET /checkout/delivery-addresses':
      case 'POST /checkout/delivery-addresses':
        if (!cookie) return reply({ error: { code: 'UNAUTHENTICATED' } }, 401);
        if (!sessions.has(cookie)) return reply({ code: 'UNAUTHORIZED', message: 'Inicia sesión para continuar.' }, 401);
        if (options.method === 'GET') return reply({ data: addresses });
        if ('customerId' in body) return reply({ error: { code: 'ADDRESS_VALIDATION_ERROR', fields: ['customerId'] } }, 400);
        addresses.push({ addressId: 'dir-' + addresses.length, street: body.street });
        return reply({ data: addresses.at(-1) }, 201);
      case 'POST /password/recuperar': return reply(undefined, 202);
      default: return reply({ error: 'Ruta no encontrada' }, 404);
    }
  };
  return { request, calls, sessions };
}

test('configure exige autorización explícita, el BFF aprobado y origen HTTPS exacto', () => {
  assert.equal(configure(env).mode, 'REAL');
  assert.equal(configure(env).base, 'https://g1-marketplace-backend.onrender.com/api/v1');
  for (const [change, message] of [
    [{ BFF_REAL_AUTHORIZED: '' }, /BFF_REAL_AUTHORIZED=1/],
    [{ BFF_BASE_URL: 'https://otro-host.example' }, /BFF desplegado aprobado/],
    [{ BFF_BASE_URL: 'https://g1-marketplace-backend.onrender.com/api/v1' }, /solo un origen/],
    [{ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, /TLS/],
    [{ BFF_WEB_ORIGIN: 'http://web.example' }, /HTTPS/],
    [{ BFF_WEB_ORIGIN: 'https://web.example/ruta' }, /origen exacto/],
    [{ BFF_UNKNOWN_EMAIL: env.BFF_EMAIL.toUpperCase() }, /distintos/],
    [{ BFF_PHONE: '999999999' }, /BFF_PHONE/],
    [{ BFF_NEW_EMAIL: 'nuevo@example.invalid' }, /juntos/],
    [{ BFF_MFA_PASSWORD: 'solo-clave' }, /juntos/],
    [{ BFF_MODE: 'mock', BFF_BASE_URL: 'https://g1-marketplace-backend.onrender.com' }, /MOCK solo admite/],
  ]) {
    assert.throws(() => configure({ ...env, ...change }), message);
  }
});

test('MOCK: la ronda completa pasa con ≤ 30 solicitudes, Origin del BFF y cookie de sesión en memoria', async () => {
  const bff = fakeBff();
  const result = await run(config, { request: bff.request });
  assert.equal(result.failure, null);
  const executed = result.rows.filter((row) => row.result !== 'SKIP');
  assert.ok(executed.every((row) => row.result === 'PASS'), JSON.stringify(executed.filter((row) => row.result !== 'PASS')));
  assert.equal(result.requests, executed.length);
  assert.ok(result.requests <= MAX_REQUESTS);
  assert.deepEqual(result.rows.filter((row) => row.result === 'SKIP').map((row) => row.issue), [25, 29]);
  assert.equal(new Set(executed.map((row) => row.requestId)).size, executed.length);
  assert.ok(executed.every((row) => row.requestIdEchoed && /^\d{2}:\d{2}:\d{2}$/.test(row.lima)));
  // Cada mutación lleva el Origin configurado salvo la prueba de CSRF.
  const mutations = bff.calls.filter((call) => !call.key.startsWith('GET'));
  assert.equal(mutations.filter((call) => call.headers.Origin !== WEB).length, 1);
  // La cookie anterior se reenvía tras el logout y la sesión ya no existe en el BFF.
  assert.equal(bff.sessions.size, 0);
  const afterLogout = bff.calls.slice(bff.calls.findIndex((call) => call.key === 'POST /auth/logout') + 1);
  assert.ok(afterLogout.some((call) => call.key === 'POST /auth/refresh' && /g1_session=/.test(call.headers.Cookie)));
  assert.ok(result.notes.some((note) => note.includes('no acredita')));
});

test('MOCK: el informe no contiene contraseñas, correos, teléfono ni cookies', async () => {
  const bff = fakeBff();
  const result = await run(config, { request: bff.request });
  const report = { mode: 'MOCK', host: config.host, commit: 'abc1234', startedAt: new Date().toISOString(),
    requests: result.requests, failure: result.failure, notes: result.notes, cases: result.rows };
  const text = JSON.stringify(report) + renderMarkdown(report);
  assertClean(text, Object.values(config.credentials));
  assert.doesNotMatch(text, /opaco-del-doble|Persona Doble|example\.invalid|\+51900000000/);
  assert.match(renderMarkdown(report), /\| 1 \| Capacidades del BFF \|/);
  assert.throws(() => assertClean('x ' + env.BFF_PASSWORD, [env.BFF_PASSWORD]), /sensible/);
  assert.throws(() => assertClean('__Host-g1_session=abc', []), /sesión/);
});

test('MOCK: una respuesta inesperada detiene la ronda y cierra la sesión abierta', async () => {
  const bff = fakeBff({
    'POST /checkout/delivery-addresses': ({ reply }) => reply({ code: 'ADDRESS_SERVICE_UNAVAILABLE' }, 503),
  });
  const result = await run(config, { request: bff.request });
  assert.match(result.failure, /Registrar dirección sintética propia/);
  const last = result.rows.at(-1);
  assert.equal(last.test, 'Limpieza: cerrar la sesión abierta');
  assert.equal(last.result, 'PASS');
  assert.equal(bff.sessions.size, 0);
  assert.ok(!bff.calls.some((call) => call.key === 'POST /password/recuperar'));
});

test('MOCK: un registro que filtra la existencia de la cuenta es FAIL', async () => {
  const bff = fakeBff({
    'POST /auth/registro': ({ reply }) => reply({ code: 'CORREO_NO_DISPONIBLE', message: 'x', correo: 'filtrado' }, 409),
  });
  const result = await run(config, { request: bff.request });
  assert.match(result.failure, /Registro con correo ya registrado/);
  assert.ok(!bff.calls.some((call) => call.key === 'POST /auth/login' && call.body.contrasena === env.BFF_PASSWORD));
});

test('MOCK: recuperación distinta para el correo desconocido es FAIL', async () => {
  let n = 0;
  const bff = fakeBff({
    'POST /password/recuperar': ({ reply }) => (++n === 1 ? reply(undefined, 202) : reply({ code: 'NO_ENCONTRADO' }, 404)),
  });
  const result = await run(config, { request: bff.request });
  assert.match(result.failure, /correo no registrado/);
});

test('MOCK: un token de G7 en la respuesta del BFF es FAIL aunque el HTTP coincida', async () => {
  const bff = fakeBff({
    'GET /auth/capabilities': ({ reply }) => reply({ login: true, registro: true, recuperacion: true, accessToken: 'x' }),
  });
  const result = await run(config, { request: bff.request });
  assert.match(result.failure, /Capacidades/);
  assert.equal(result.requests, 1);
});

test('MOCK: 429 corta la ronda sin más solicitudes ni prompts', async () => {
  const prompts = [];
  const bff = fakeBff({
    'POST /auth/login': ({ reply }) => new Response(JSON.stringify({ code: 'RATE_LIMITED' }), { status: 429, headers: { 'Retry-After': '60' } }),
  });
  const result = await run({ ...config, credentials: { ...config.credentials, mfaEmail: 'mfa@example.invalid', mfaPassword: 'x-x-x-x' } },
    { request: bff.request, readSecret: async (text) => { prompts.push(text); return '123456'; } });
  assert.match(result.failure, /429/);
  assert.deepEqual(result.stopped, { at: 3, retryAfter: '60' });
  assert.equal(bff.calls.length, 3);
  assert.equal(prompts.length, 0);
});

test('MOCK: rama MFA con el OTP escrito por Jim y registro nuevo opcional', async () => {
  const prompts = [];
  const bff = fakeBff();
  const credentials = { ...config.credentials, mfaEmail: 'mfa@example.invalid', mfaPassword: 'Clave-mfa-1',
    newEmail: 'nuevo@example.invalid', newPassword: 'Clave-nueva-1' };
  const result = await run({ ...config, credentials },
    { request: bff.request, readSecret: async (text) => { prompts.push(text); return '123456'; } });
  assert.equal(result.failure, null);
  assert.equal(prompts.length, 1);
  assert.ok(result.rows.every((row) => row.result === 'PASS'));
  assert.ok(result.requests <= MAX_REQUESTS);
  const otp = bff.calls.find((call) => call.key === 'POST /auth/otp/verificar');
  assert.deepEqual(otp.body, { codigo: '123456' });
  assert.equal(bff.sessions.size, 0);
});

test('MOCK: OTP omitido salta la verificación y libera el desafío', async () => {
  const bff = fakeBff();
  const result = await run({ ...config, credentials: { ...config.credentials, mfaEmail: 'mfa@example.invalid', mfaPassword: 'Clave-mfa-1' } },
    { request: bff.request, readSecret: async () => '' });
  assert.equal(result.failure, null);
  assert.ok(result.rows.some((row) => row.result === 'SKIP' && row.test === 'Verificar OTP'));
  assert.ok(!bff.calls.some((call) => call.key === 'POST /auth/otp/verificar'));
});

test('contraseña desechable cumple la política y hora en Lima', () => {
  const value = throwawayPassword({ longitudMinima: 14 });
  assert.ok(value.length >= 18 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[!#%*+\-_]/.test(value));
  assert.equal(limaTime(new Date('2026-11-26T07:05:09Z')), '02:05:09');
});
