import { execFileSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

// Segunda ronda REAL de Seguridad (G7) a través del BFF desplegado de G1.
// El BFF usa sesión por cookie HttpOnly: el kit guarda las cookies en memoria
// y nunca las escribe en consola, informe ni disco.
export const DEFAULT_BFF = 'https://g1-marketplace-backend.onrender.com';
export const MAX_REQUESTS = 30;
const issues = [25, 29, 33, 37, 115];
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sessionCookie = /(?:^|-)g1_session$/;
const challengeCookie = /(?:^|-)g1_challenge$/;

export class ConfigurationError extends Error {}
class Unexpected extends Error {}
class RateLimited extends Error {}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new ConfigurationError('Falta ' + name);
  return value;
}

export function configure(env = process.env) {
  const mode = (env.BFF_MODE ?? 'real').toLowerCase();
  if (!['mock', 'real'].includes(mode)) throw new ConfigurationError('BFF_MODE debe ser mock o real.');
  let url;
  try { url = new URL(env.BFF_BASE_URL?.trim() || DEFAULT_BFF); }
  catch { throw new ConfigurationError('BFF_BASE_URL no es válida.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ConfigurationError('BFF_BASE_URL debe ser solo un origen, sin ruta ni credenciales.');
  }
  if (mode === 'real') {
    if (env.BFF_REAL_AUTHORIZED !== '1') {
      throw new ConfigurationError('REAL requiere BFF_REAL_AUTHORIZED=1 y la autorización de G7 para esta ronda.');
    }
    if (url.origin !== DEFAULT_BFF) throw new ConfigurationError('REAL solo admite el BFF desplegado aprobado: ' + DEFAULT_BFF);
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new ConfigurationError('REAL requiere verificación TLS habilitada.');
  } else if (!loopback || url.protocol !== 'http:') {
    throw new ConfigurationError('MOCK solo admite un BFF local por HTTP (localhost).');
  }

  let webOrigin;
  try { webOrigin = new URL(required(env, 'BFF_WEB_ORIGIN')); }
  catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError('BFF_WEB_ORIGIN no es válido.');
  }
  if (webOrigin.origin !== env.BFF_WEB_ORIGIN.trim().replace(/\/$/, '') ||
    (mode === 'real' && webOrigin.protocol !== 'https:')) {
    throw new ConfigurationError('BFF_WEB_ORIGIN debe ser el origen exacto (G1_WEB_ORIGIN del BFF), HTTPS en REAL.');
  }

  const credentials = {
    email: required(env, 'BFF_EMAIL'), password: required(env, 'BFF_PASSWORD'),
    unknownEmail: required(env, 'BFF_UNKNOWN_EMAIL'), phone: required(env, 'BFF_PHONE'),
    newEmail: env.BFF_NEW_EMAIL?.trim() || undefined, newPassword: env.BFF_NEW_PASSWORD || undefined,
    mfaEmail: env.BFF_MFA_EMAIL?.trim() || undefined, mfaPassword: env.BFF_MFA_PASSWORD || undefined,
  };
  if (Boolean(credentials.newEmail) !== Boolean(credentials.newPassword)) {
    throw new ConfigurationError('El registro nuevo necesita BFF_NEW_EMAIL y BFF_NEW_PASSWORD juntos.');
  }
  if (Boolean(credentials.mfaEmail) !== Boolean(credentials.mfaPassword)) {
    throw new ConfigurationError('La rama MFA necesita BFF_MFA_EMAIL y BFF_MFA_PASSWORD juntos.');
  }
  const emails = [credentials.email, credentials.unknownEmail, credentials.newEmail, credentials.mfaEmail].filter(Boolean);
  if (emails.some((email) => !emailPattern.test(email)) ||
    new Set(emails.map((email) => email.toLowerCase())).size !== emails.length) {
    throw new ConfigurationError('Los correos deben ser válidos y distintos entre sí.');
  }
  if (!/^\+51\d{9}$/.test(credentials.phone)) throw new ConfigurationError('BFF_PHONE: +51 y nueve dígitos (ficticio).');
  return { mode: mode.toUpperCase(), base: url.origin + '/api/v1', host: url.host, webOrigin: webOrigin.origin, credentials };
}

export async function readHidden(instruction) {
  if (!process.stdin.isTTY) return '';
  const silent = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const terminal = createInterface({ input: process.stdin, output: silent, terminal: true, historySize: 0 });
  try {
    process.stderr.write(instruction + ' (entrada oculta; Enter sin valor omite): ');
    return (await terminal.question('')).trim();
  } finally {
    terminal.close();
    process.stderr.write('\n');
  }
}

export function limaTime(date) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

/** Contraseña desechable que cumple la política publicada; nunca se imprime. */
export function throwawayPassword(policy) {
  const pick = (chars) => chars[randomInt(chars.length)];
  const parts = [pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick('abcdefghijkmnopqrstuvwxyz'), pick('23456789'), pick('!#%*+-_')];
  const length = Math.max(16, (policy?.longitudMinima ?? 12) + 4);
  while (parts.length < length) parts.push(pick('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'));
  return parts.join('');
}

const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const keysWithin = (value, allowed) => record(value) && Object.keys(value).every((key) => allowed.includes(key));
const errorCode = (value) => {
  const code = record(value?.error) ? value.error.code : value?.code;
  return typeof code === 'string' && /^[A-Z_]{3,40}$/.test(code) ? code : undefined;
};
// Ninguna respuesta del BFF puede llevar material de G7 al navegador.
const noProviderTokens = (raw) => !/accessToken|refreshToken|challengeToken|eyJ[A-Za-z0-9_-]{10,}/.test(raw);
const validPolicy = (value) => record(value) && Number.isInteger(value.longitudMinima) && value.longitudMinima > 0 &&
  ['requiereMayuscula', 'requiereMinuscula', 'requiereDigito', 'requiereCaracterEspecial']
    .every((name) => typeof value[name] === 'boolean');

export async function run(config, { request = fetch, readSecret = readHidden, log = () => {} } = {}) {
  const c = config.credentials;
  const rows = [];
  const notes = [];
  const jar = new Map();
  let requests = 0;
  let stopped = null;

  const cookieHeader = () => [...jar].map(([name, value]) => name + '=' + value).join('; ');
  const sessionPair = () => [...jar].find(([name]) => sessionCookie.test(name));

  function skip(issue, test, reason) {
    rows.push({ issue, test, result: 'SKIP', reason });
    log('     SKIP · #' + issue + ' ' + test + ': ' + reason);
  }

  async function call(issue, test, method, path, {
    body, origin = method !== 'GET', cookie = 'jar', expect, verify = () => true, cleanup = false,
  }) {
    if (requests >= MAX_REQUESTS) throw new Unexpected('Tope de ' + MAX_REQUESTS + ' solicitudes alcanzado.');
    const n = ++requests;
    const requestId = randomUUID();
    const headers = { Accept: 'application/json', 'X-Request-Id': requestId };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (origin) headers.Origin = origin === true ? config.webOrigin : origin;
    const cookies = cookie === 'jar' ? cookieHeader() : cookie ?? '';
    if (cookies) headers.Cookie = cookies;
    const started = new Date();
    const row = {
      n, issue, test, method, route: '/api/v1' + path, at: started.toISOString(), lima: limaTime(started),
      requestId, mode: config.mode, expected: expect, cookieSent: Boolean(cookies),
      originSent: origin ? (origin === true ? 'G1_WEB_ORIGIN' : 'ajeno') : 'no',
    };
    const t0 = performance.now();
    let response;
    let raw = '';
    try {
      response = await request(config.base + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: AbortSignal.timeout(60_000),
      });
      raw = await response.text();
    } catch (error) {
      row.ms = Math.round(performance.now() - t0);
      row.result = 'FAIL';
      row.response = error?.name === 'TimeoutError' ? 'TIMEOUT_CLIENTE' : 'ERROR_DE_TRANSPORTE';
      rows.push(row);
      log(line(row));
      if (cleanup) return undefined;
      throw new Unexpected(test + ': sin respuesta del BFF.');
    }
    row.ms = Math.round(performance.now() - t0);
    row.http = response.status;
    row.requestIdEchoed = response.headers.get('x-request-id') === requestId;
    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    const cookieEvents = [];
    for (const header of setCookies) {
      const [pair, ...attributes] = header.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const cleared = value === '' || attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
      if (cleared) jar.delete(name); else jar.set(name, value);
      cookieEvents.push({ name, event: cleared ? 'borrada' : 'emitida' });
    }
    row.setCookie = cookieEvents;
    let data;
    try { data = raw === '' ? undefined : JSON.parse(raw); }
    catch { data = Symbol.for('no-json'); }
    row.response = data === undefined ? 'vacía' : typeof data === 'symbol' ? 'no-JSON' : 'JSON';
    const code = typeof data === 'symbol' ? undefined : errorCode(data);
    if (code) row.code = code;
    const issued = (pattern) => cookieEvents.some((event) => pattern.test(event.name) && event.event === 'emitida');
    const ok = typeof data !== 'symbol' && [expect].flat().includes(response.status) && noProviderTokens(raw) &&
      verify(data, { issued, cookieEvents });
    row.result = ok ? 'PASS' : 'FAIL';
    rows.push(row);
    log(line(row));
    if (response.status === 429) {
      stopped = { at: row.n, retryAfter: response.headers.get('retry-after') ?? null };
      throw new RateLimited('HTTP 429');
    }
    if (!ok && !cleanup) throw new Unexpected(test + ': respuesta inesperada (HTTP ' + response.status + ').');
    return ok ? (data ?? null) : undefined;
  }

  async function logoutIfNeeded(reason) {
    if (!sessionPair() && ![...jar.keys()].some((name) => challengeCookie.test(name))) return;
    if (requests >= MAX_REQUESTS || stopped) return;
    notes.push('Cierre de limpieza tras ' + reason + '.');
    try {
      await call(33, 'Limpieza: cerrar la sesión abierta', 'POST', '/auth/logout', { expect: 200, cleanup: true });
    } catch {
      notes.push('La limpieza no se completó: cerrar la sesión desde la web o esperar su vencimiento.');
    }
  }

  async function execute() {
    // 1. Solo BFF: capacidades y política (no hay sesión ni datos de cuenta).
    await call('base', 'Capacidades del BFF', 'GET', '/auth/capabilities', {
      expect: 200, verify: (d) => d?.login === true && d.registro === true && d.recuperacion === true,
    });
    const policy = await call('base', 'Política de contraseña vía BFF', 'GET', '/password/politica', {
      expect: 200, verify: validPolicy,
    });

    // CSRF: el BFF corta un Origin ajeno antes de contactar a G7.
    await call(29, 'Login con Origin ajeno rechazado antes de G7', 'POST', '/auth/login', {
      origin: 'https://origen-no-autorizado.example',
      body: { correo: 'kit-origen@example.invalid', contrasena: throwawayPassword(policy) },
      expect: 403, verify: (d, { issued }) => errorCode(d) === 'FORBIDDEN' && !issued(sessionCookie),
    });

    // 2. #25 registro.
    const registration = (correo, contrasena) => ({
      correo, contrasena, nombres: 'Kit', apellidos: 'BFF H5', celular: c.phone, aceptaTerminos: true,
    });
    await call(25, 'Registro con correo ya registrado: respuesta neutra', 'POST', '/auth/registro', {
      body: registration(c.email, throwawayPassword(policy)), expect: 409,
      verify: (d, { issued }) => errorCode(d) === 'CORREO_NO_DISPONIBLE' && keysWithin(d, ['code', 'message']) &&
        !issued(sessionCookie),
    });
    if (c.newEmail) {
      await call(25, 'Registro nuevo queda pendiente de verificación y sin sesión', 'POST', '/auth/registro', {
        body: registration(c.newEmail, c.newPassword), expect: 201,
        verify: (d, { cookieEvents }) => d?.estado === 'PENDIENTE_VERIFICACION' && uuid.test(d.id ?? '') &&
          keysWithin(d, ['id', 'estado']) && cookieEvents.length === 0,
      });
    } else skip(25, 'Registro nuevo', 'No se indicó alias nuevo (opcional).');

    // 3. #29 login.
    await call(29, 'Login con contraseña incorrecta: 401 sin pistas', 'POST', '/auth/login', {
      body: { correo: c.email, contrasena: 'Kit-' + randomUUID() }, expect: 401,
      verify: (d, { issued }) => errorCode(d) === 'CREDENCIALES_INVALIDAS' && keysWithin(d, ['code', 'message']) &&
        !issued(sessionCookie),
    });
    const login = await call(29, 'Login CLIENTE sin MFA emite cookie de sesión', 'POST', '/auth/login', {
      body: { correo: c.email, contrasena: c.password }, expect: 200,
      verify: (d, { issued }) => d?.authenticated === true && Array.isArray(d.user?.roles) &&
        d.user.roles.includes('CLIENTE') && uuid.test(d.user.id ?? '') && issued(sessionCookie),
    });
    await call(29, 'Sesión del BFF autenticada para el mismo usuario', 'GET', '/auth/session', {
      expect: 200, verify: (d) => d?.authenticated === true && d.user?.id === login.user.id,
    });

    // 6. #115/#116 direcciones por el BFF: el titular sale de la sesión, nunca del cliente.
    await call(115, 'Listar direcciones propias', 'GET', '/checkout/delivery-addresses', {
      expect: 200, verify: (d) => Array.isArray(d?.data),
    });
    const address = {
      label: 'Kit BFF H5', street: 'Direccion sintetica kit BFF', district: 'Lima', province: 'Lima',
      department: 'Lima', reference: 'Prueba H5 sin envio real', phone: c.phone,
    };
    const created = await call(115, 'Registrar dirección sintética propia', 'POST', '/checkout/delivery-addresses', {
      body: address, expect: 201, verify: (d) => typeof d?.data?.addressId === 'string' && d.data.addressId.length > 0,
    });
    await call(115, 'La dirección creada aparece en la lista propia', 'GET', '/checkout/delivery-addresses', {
      expect: 200, verify: (d) => Array.isArray(d?.data) && d.data.some((item) => item?.addressId === created.data.addressId),
    });
    await call(115, 'Indicar otro titular en el cuerpo es rechazado (400)', 'POST', '/checkout/delivery-addresses', {
      body: { ...address, customerId: randomUUID() }, expect: 400,
      verify: (d) => errorCode(d) === 'ADDRESS_VALIDATION_ERROR' && d.error.fields?.includes('customerId'),
    });

    // 4. #33 logout: la cookie anterior se reenvía a propósito para probar que quedó inválida.
    const [name, value] = sessionPair();
    const oldCookie = name + '=' + value;
    await call(33, 'Logout cierra la sesión y revoca en G7', 'POST', '/auth/logout', {
      expect: 200, verify: (d, { cookieEvents }) => d?.authenticated === false && d.remoteRevocationPending === false &&
        cookieEvents.some((event) => sessionCookie.test(event.name) && event.event === 'borrada'),
    });
    await call(33, 'Cookie anterior: la sesión responde anónima', 'GET', '/auth/session', {
      cookie: oldCookie, expect: 200, verify: (d) => d?.authenticated === false && !('user' in d),
    });
    await call(33, 'Cookie anterior: refresh rechazado', 'POST', '/auth/refresh', {
      cookie: oldCookie, expect: 401, verify: (d) => errorCode(d) === 'UNAUTHORIZED',
    });
    await call(115, 'Cookie anterior: direcciones rechazadas (401)', 'GET', '/checkout/delivery-addresses', {
      cookie: oldCookie, expect: 401, verify: (d) => errorCode(d) === 'UNAUTHORIZED',
    });
    await call(115, 'Sin sesión: direcciones rechazadas (401)', 'GET', '/checkout/delivery-addresses', {
      cookie: null, expect: 401, verify: (d) => errorCode(d) === 'UNAUTHENTICATED',
    });
    await call(33, 'Logout repetido es idempotente', 'POST', '/auth/logout', {
      cookie: oldCookie, expect: 200, verify: (d) => d?.authenticated === false && d.remoteRevocationPending === false,
    });

    // 3b. Rama MFA opcional (cuentas A/B): Jim escribe el OTP que recibe por correo.
    if (c.mfaEmail) {
      const challenge = await call(29, 'Login MFA: desafío por cookie, sin sesión', 'POST', '/auth/login', {
        body: { correo: c.mfaEmail, contrasena: c.mfaPassword }, expect: 200,
        verify: (d, { issued }) => d?.mfaRequerido === true && d.canal === 'EMAIL' && issued(challengeCookie) &&
          !issued(sessionCookie),
      });
      await call(29, 'Solicitar OTP por correo', 'POST', '/auth/otp/solicitar', {
        expect: 200, verify: (d) => d?.canal === 'EMAIL' && typeof d.destinoEnmascarado === 'string',
      });
      const otp = challenge && await readSecret('Escribe el OTP de seis dígitos que llegó a la cuenta MFA');
      if (/^\d{6}$/.test(otp ?? '')) {
        await call(29, 'Verificar OTP emite cookie de sesión', 'POST', '/auth/otp/verificar', {
          body: { codigo: otp }, expect: 200,
          verify: (d, { issued }) => d?.authenticated === true && issued(sessionCookie),
        });
      } else skip(29, 'Verificar OTP', 'Código omitido o sin seis dígitos.');
      await call(33, 'Cerrar la sesión o el desafío MFA', 'POST', '/auth/logout', {
        expect: 200, verify: (d) => d?.authenticated === false && d.remoteRevocationPending === false,
      });
    } else skip(29, 'Rama MFA (cuentas A/B)', 'No se indicó cuenta MFA (opcional).');

    // 5. #37 recuperación neutra: mismo HTTP y mismo cuerpo (vacío) para cuenta conocida y desconocida.
    await call(37, 'Recuperación de la cuenta conocida', 'POST', '/password/recuperar', {
      body: { correo: c.email }, expect: 202, verify: (d, { cookieEvents }) => d === undefined && cookieEvents.length === 0,
    });
    await call(37, 'Recuperación de un correo no registrado', 'POST', '/password/recuperar', {
      body: { correo: c.unknownEmail }, expect: 202, verify: (d, { cookieEvents }) => d === undefined && cookieEvents.length === 0,
    });
    const [known, unknown] = rows.filter((row) => row.issue === 37 && row.http);
    notes.push('Recuperación (#37/#38): HTTP ' + known.http + ' y ' + unknown.http + ', cuerpos ' + known.response +
      ' y ' + unknown.response + '; latencias ' + known.ms + ' ms y ' + unknown.ms +
      ' ms. Dos muestras no permiten concluir paridad temporal.');
    notes.push('Un 202 de recuperación no acredita que G7 haya enviado el correo: confirmarlo en el buzón.');
  }

  let failure = null;
  try {
    await execute();
  } catch (error) {
    if (error instanceof RateLimited) failure = 'Detenida por HTTP 429; no reanudar sin coordinar con G7.';
    else if (error instanceof Unexpected) failure = error.message;
    else throw error;
    await logoutIfNeeded('la detención');
  }
  return { rows, requests, notes, failure, stopped };
}

function line(row) {
  return '#' + String(row.n).padStart(2, '0') + ' ' + row.lima + ' ' + row.method.padEnd(4) + ' ' + row.route.padEnd(38) +
    ' ' + String(row.http ?? '---') + ' ' + row.requestId + ' ' + row.result + ' · #' + row.issue + ' ' + row.test;
}

const feeds = {
  base: 'capacidades', 25: '#25 / QA #26', 29: '#29 / QA #30', 33: '#33 / QA #34', 37: '#37 / QA #38', 115: '#115 / QA #116',
};

export function renderMarkdown(report) {
  const lines = [
    '# Segunda ronda por el BFF desplegado · ' + report.mode, '',
    '- BFF: `' + report.host + '` · commit del kit `' + report.commit + '`',
    '- Inicio (UTC): ' + report.startedAt + ' · solicitudes: ' + report.requests + ' de ' + MAX_REQUESTS,
    '- Resultado: ' + (report.failure ? 'DETENIDA · ' + report.failure : 'completa'), '',
    '| # | Caso | Hora Lima | Ruta | HTTP | requestId | Resultado | MOCK/REAL | Alimenta |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of report.cases) {
    if (row.result === 'SKIP') {
      lines.push('| — | ' + row.test + ' | — | — | — | — | SKIP: ' + row.reason + ' | — | ' + feeds[row.issue] + ' |');
      continue;
    }
    lines.push('| ' + row.n + ' | ' + row.test + ' | ' + row.lima + ' | `' + row.method + ' ' + row.route + '` | ' +
      (row.http ?? row.response) + (row.code ? ' `' + row.code + '`' : '') + ' | `' + row.requestId + '` | ' + row.result +
      ' | ' + row.mode + ' | ' + feeds[row.issue] + ' |');
  }
  lines.push('', '## Notas', '', ...report.notes.map((note) => '- ' + note),
    '- REAL significa respuesta del BFF desplegado, que habla con el G7 real. El kit no llama directo a G7.',
    '- `GET /auth/session` sin sesión válida responde 200 `authenticated:false` (contrato del BFF), no 401.',
    '- El BFF no acepta un titular en la ruta ni en el cuerpo: el 403 de otro usuario se acreditó en la ronda directa a G7 (23/11); aquí se evidencia con el 400 `ADDRESS_VALIDATION_ERROR` y con el 401 sin sesión.',
    '- Sin cuerpos, cookies, contraseñas, correos, OTP ni enlaces en este informe.', '');
  return lines.join('\n');
}

/** Corta antes de escribir si algún valor sensible llegó al informe. */
export function assertClean(text, secrets) {
  for (const secret of secrets.filter((value) => typeof value === 'string' && value.length >= 4)) {
    if (text.toLowerCase().includes(secret.toLowerCase())) throw new Error('El informe contiene un valor sensible.');
  }
  if (/eyJ[A-Za-z0-9_-]{10,}|g1_session=|g1_challenge=/.test(text)) throw new Error('El informe contiene material de sesión.');
}

async function main() {
  const config = configure();
  if (config.credentials.mfaEmail && !process.stdin.isTTY) {
    throw new ConfigurationError('La rama MFA necesita una terminal interactiva para escribir el OTP.');
  }
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const startedAt = new Date().toISOString();
  console.log(config.mode + ' · BFF ' + config.host + ' · tope ' + MAX_REQUESTS + ' solicitudes · ' + limaTime(new Date()) + ' Lima');
  const result = await run(config, { log: (text) => console.log(text) });
  const summary = Object.fromEntries(issues.map((issue) => [issue, {
    passed: result.rows.filter((row) => row.issue === issue && row.result === 'PASS').length,
    failed: result.rows.filter((row) => row.issue === issue && row.result === 'FAIL').length,
    skipped: result.rows.filter((row) => row.issue === issue && row.result === 'SKIP').length,
  }]));
  const report = {
    mode: config.mode, host: config.host, commit, startedAt, requests: result.requests,
    failure: result.failure, stopped: result.stopped, summary, notes: result.notes, cases: result.rows,
  };
  const json = JSON.stringify(report, null, 2) + '\n';
  const markdown = renderMarkdown(report);
  const secrets = Object.values(config.credentials);
  assertClean(json, secrets);
  assertClean(markdown, secrets);
  const folder = 'docs/evidencias/H5/integracion-real/bff/' + startedAt.slice(0, 10);
  const name = folder + '/' + config.mode + '-' + startedAt.replaceAll(':', '-') + '-' + randomUUID().slice(0, 8);
  await mkdir(folder, { recursive: true });
  await writeFile(name + '.json', json, { flag: 'wx' });
  await writeFile(name + '.md', markdown, { flag: 'wx' });
  const failed = result.rows.filter((row) => row.result === 'FAIL').length;
  console.log(result.requests + ' solicitudes, ' + failed + ' fallos. Informe: ' + name + '.md');
  if (result.failure) {
    console.error('Ronda detenida: ' + result.failure);
    process.exitCode = 1;
  } else if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof ConfigurationError ? error.message : 'El kit se detuvo por un error interno. No se imprimen detalles sensibles.');
    process.exitCode = 1;
  });
}
