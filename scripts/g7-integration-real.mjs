import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const contract = 'G7 OpenAPI 1.0.0 @ 1b8f2e35448075a6c396b70fdd4ec1d5b1aa9201';
const issues = [25, 29, 33, 37, 41, 115];
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const maxRequests = 25;
const rows = [];
let requests = 0;

class ConfigurationError extends Error {}

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new ConfigurationError('Falta ' + name);
  return value;
}

function configure() {
  const mode = required('G7_INTEGRATION_MODE');
  if (!['mock', 'real'].includes(mode)) throw new ConfigurationError('G7_INTEGRATION_MODE debe ser mock o real.');
  let url;
  try { url = new URL(required('G7_BASE_URL')); }
  catch (error) {
    if (error instanceof ConfigurationError) throw error;
    throw new ConfigurationError('G7_BASE_URL no es válida.');
  }
  const mock = mode === 'mock';
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const path = url.pathname.replace(/\/$/, '');
  if (url.username || url.password || url.search || url.hash ||
    (mock ? !loopback || url.protocol !== 'http:' || path !== '' : loopback || url.protocol !== 'https:' || path !== '/api/v1')) {
    throw new ConfigurationError('Usa HTTP local sin prefijo para Prism o HTTPS /api/v1 del sandbox G7 aprobado.');
  }

  const synthetic = {
    TEST_EMAIL: 'cliente-fixture@example.invalid', TEST_PASSWORD: 'SoloFixture-000!',
    REGISTER_EMAIL: 'registro-fixture@example.invalid', REGISTER_PASSWORD: 'SoloFixture-003!', REGISTER_NAME: 'Fixture', REGISTER_SURNAME: 'Prism',
    REGISTER_PHONE: '+51000000000', VERIFY_TOKEN: 'fixture-verificacion', EXPIRED_VERIFY_TOKEN: 'fixture-vencido',
    UNKNOWN_EMAIL: 'desconocido-fixture@example.invalid', RESET_TOKEN: 'fixture-reset',
    EXPIRED_RESET_TOKEN: 'fixture-reset-vencido', RESET_EMAIL: 'reset-fixture@example.invalid',
    NEW_PASSWORD: 'SoloFixture-001!', OTHER_USER_ID: '22222222-2222-2222-8222-222222222222',
    MFA_EMAIL: 'mfa-fixture@example.invalid', MFA_PASSWORD: 'SoloFixture-002!', MFA_OTP: '000000',
  };
  let environment = 'Prism local';
  let providerSha = null;
  const credentials = {};
  if (mock) {
    Object.assign(credentials, synthetic);
  } else {
    if (process.env.G7_REAL_AUTHORIZED !== '1') {
      throw new ConfigurationError('REAL requiere G7_REAL_AUTHORIZED=1 y autorización del sandbox de G7.');
    }
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
      throw new ConfigurationError('REAL requiere verificación TLS habilitada.');
    }
    environment = required('G7_TEST_ENVIRONMENT');
    if (!['sandbox', 'staging'].includes(environment)) throw new ConfigurationError('Entorno REAL: sandbox o staging.');
    providerSha = required('G7_PROVIDER_SHA');
    if (!/^[0-9a-f]{40}$/i.test(providerSha)) throw new ConfigurationError('G7_PROVIDER_SHA debe ser un SHA completo.');
    for (const name of Object.keys(synthetic)) {
      if (name.startsWith('MFA_')) continue;
      credentials[name] = required('G7_' + name);
    }
    const mfaNames = ['MFA_EMAIL', 'MFA_PASSWORD', 'MFA_OTP'];
    if (mfaNames.some((name) => process.env['G7_' + name])) {
      for (const name of mfaNames) credentials[name] = required('G7_' + name);
    }
  }

  const emails = ['TEST_EMAIL', 'REGISTER_EMAIL', 'UNKNOWN_EMAIL', 'RESET_EMAIL', ...(credentials.MFA_EMAIL ? ['MFA_EMAIL'] : [])];
  if (new Set(emails.map((name) => credentials[name].toLowerCase())).size !== emails.length ||
    emails.some((name) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials[name])) ||
    !uuid.test(credentials.OTHER_USER_ID) ||
    credentials.VERIFY_TOKEN === credentials.EXPIRED_VERIFY_TOKEN ||
    credentials.RESET_TOKEN === credentials.EXPIRED_RESET_TOKEN ||
    (credentials.MFA_OTP && !/^\d{6}$/.test(credentials.MFA_OTP))) {
    throw new ConfigurationError('Usa fixtures distintos de G7 y revisa los formatos de correo, usuario y OTP.');
  }
  return { mode: mock ? 'MOCK' : 'REAL', mock, base: url.origin + path, environment, providerSha, credentials };
}

function skip(issue, test, reason) {
  rows.push({ issue, test, result: 'SKIP', reason });
}

function session(body, role = 'CLIENTE') {
  return typeof body?.accessToken === 'string' && body.accessToken.length > 0 &&
    typeof body.refreshToken === 'string' && body.refreshToken.length > 0 &&
    body.tokenType === 'Bearer' && uuid.test(body.usuario?.id ?? '') &&
    Array.isArray(body.usuario.roles) && body.usuario.roles.includes(role);
}

function pendingRegistration(body) {
  return body?.estado === 'PENDIENTE_VERIFICACION' && uuid.test(body.id ?? '') &&
    !('accessToken' in body) && !('refreshToken' in body);
}

function empty(body) {
  return body === undefined;
}

function problem(code) {
  return (body) => body?.code === code;
}

async function run(config) {
  const { credentials: c, mock } = config;
  async function check(issue, test, route, {
    path = route, body, token, status, example, verify = () => true, shortDeadline = false,
  }) {
    if (++requests > maxRequests) throw new Error('Límite interno de solicitudes.');
    const trace = randomUUID();
    const headers = { 'X-Request-Id': trace, Accept: 'application/json, application/problem+json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    if (mock) headers.Prefer = ['code=' + status, example && 'example=' + example].filter(Boolean).join(', ');
    const signal = AbortSignal.timeout(shortDeadline ? 1 : 15_000);
    const evidence = {
      issue, test, method: body === undefined ? 'GET' : 'POST', route,
      requestFields: Object.keys(body ?? {}), bearer: Boolean(token), trace,
      expected: shortDeadline ? 'CLIENT_TIMEOUT' : status,
    };
    const start = performance.now();
    let data;
    try {
      const response = await fetch(config.base + path, {
        method: evidence.method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal,
      });
      evidence.httpStatus = response.status;
      evidence.traceEchoed = response.headers.get('x-request-id') === trace;
      const raw = await response.text();
      data = raw === '' ? undefined : JSON.parse(raw);
      evidence.response = data === undefined ? 'empty' : 'json';
      evidence.result = !shortDeadline && response.status === status && verify(data) ? 'PASS' : 'FAIL';
    } catch {
      evidence.response = signal.aborted ? 'CLIENT_TIMEOUT' : 'TRANSPORT_OR_RESPONSE_ERROR';
      evidence.result = signal.aborted && shortDeadline ? 'PASS' : 'FAIL';
    } finally {
      evidence.ms = Math.round(performance.now() - start);
      rows.push(evidence);
    }
    return evidence.result === 'PASS' ? data : undefined;
  }

  const registration = {
    correo: c.REGISTER_EMAIL, contrasena: c.REGISTER_PASSWORD, nombres: c.REGISTER_NAME,
    apellidos: c.REGISTER_SURNAME, celular: c.REGISTER_PHONE, aceptaTerminos: true, canalOrigen: 'MARKETPLACE',
  };
  const registered = await check(25, 'Registro pendiente sin sesión', '/auth/registro',
    { body: registration, status: 201, example: 'creada', verify: pendingRegistration });
  if (registered) {
    await check(25, 'Registro repetido de la misma fixture', '/auth/registro',
      { body: registration, status: 409, example: 'correoNoDisponible', verify: problem('CORREO_NO_DISPONIBLE') });
  } else skip(25, 'Registro repetido de la misma fixture', 'El alta anterior no quedó confirmada.');
  await check(25, 'Confirmación con fixture de correo', '/auth/verificar-correo',
    { body: { token: c.VERIFY_TOKEN }, status: 204, verify: empty });
  await check(25, 'Enlace de correo vencido', '/auth/verificar-correo',
    { body: { token: c.EXPIRED_VERIFY_TOKEN }, status: 410, example: 'expirado', verify: problem('ENLACE_EXPIRADO') });

  const login = await check(29, 'Login CLIENTE sin MFA', '/auth/login',
    { body: { correo: c.TEST_EMAIL, contrasena: c.TEST_PASSWORD }, status: 200, example: 'sinMfa', verify: session });
  await check(29, 'Credencial sintética inválida una sola vez', '/auth/login', {
    body: { correo: c.TEST_EMAIL, contrasena: randomUUID() }, status: 401, example: 'credencialesInvalidas',
    verify: problem('CREDENCIALES_INVALIDAS'),
  });
  if (c.MFA_EMAIL) {
    const challenge = await check(29, 'Login requiere desafío MFA sin sesión', '/auth/login', {
      body: { correo: c.MFA_EMAIL, contrasena: c.MFA_PASSWORD }, status: 200, example: 'conMfa',
      verify: (data) => data?.mfaRequerido === true && typeof data.challengeToken === 'string' && !data?.accessToken,
    });
    if (challenge) {
      await check(29, 'Solicitar OTP', '/auth/otp/solicitar', {
        body: { challengeToken: challenge.challengeToken }, status: 202, example: 'enviado',
        verify: (data) => data?.canal === 'EMAIL' && !data?.accessToken,
      });
      const mfa = await check(29, 'Verificar OTP de fixture', '/auth/otp/verificar', {
        body: { challengeToken: challenge.challengeToken, codigo: c.MFA_OTP },
        status: 200, example: 'verificado',
        // El ejemplo fijo de OTP de Prism pertenece a VENDEDOR. En REAL se exige CLIENTE.
        verify: (data) => session(data, mock ? 'VENDEDOR' : 'CLIENTE'),
      });
      if (mfa) await check(29, 'Cerrar sesión MFA de prueba', '/auth/logout', {
        body: { refreshToken: mfa.refreshToken }, token: mfa.accessToken, status: 204, verify: empty,
      });
    } else skip(29, 'Solicitar y verificar OTP', 'No se obtuvo un desafío válido.');
  } else skip(29, 'MFA por correo', 'G7 debe proveer una fixture de OTP determinista para automatizar este paso.');

  await check(37, 'Recuperación de la cuenta de prueba', '/password/recuperar',
    { body: { correo: c.TEST_EMAIL }, status: 202, verify: empty });
  await check(37, 'Recuperación neutra para correo sintético desconocido', '/password/recuperar',
    { body: { correo: c.UNKNOWN_EMAIL }, status: 202, verify: empty });

  await check(41, 'Restablecer con token de una fixture separada', '/password/restablecer',
    { body: { token: c.RESET_TOKEN, nuevaContrasena: c.NEW_PASSWORD }, status: 204, verify: empty });
  // 204 es un resultado sin cuerpo. Distinguirlo del fallo mediante la fila de evidencia.
  if (rows.at(-1).result === 'PASS') {
    await check(41, 'Reutilizar una vez el token consumido', '/password/restablecer', {
      body: { token: c.RESET_TOKEN, nuevaContrasena: c.NEW_PASSWORD }, status: 401, example: 'tokenInvalido',
      verify: problem('TOKEN_RECUPERACION_INVALIDO'),
    });
    const resetLogin = await check(41, 'Ingresar con la nueva contraseña', '/auth/login', {
      body: { correo: c.RESET_EMAIL, contrasena: c.NEW_PASSWORD }, status: 200, example: 'sinMfa', verify: session,
    });
    if (resetLogin) await check(41, 'Cerrar sesión de la fixture restablecida', '/auth/logout', {
      body: { refreshToken: resetLogin.refreshToken }, token: resetLogin.accessToken, status: 204, verify: empty,
    });
  } else skip(41, 'Reutilizar una vez el token consumido', 'El restablecimiento anterior no quedó confirmado.');
  await check(41, 'Rechazar token de recuperación genuinamente vencido', '/password/restablecer', {
    body: { token: c.EXPIRED_RESET_TOKEN, nuevaContrasena: c.NEW_PASSWORD }, status: 410, example: 'tokenExpirado',
    verify: problem('TOKEN_RECUPERACION_EXPIRADO'),
  });

  if (login && login.usuario.id.toLowerCase() !== c.OTHER_USER_ID.toLowerCase()) {
    const route = '/usuarios/{id}/direcciones';
    const ownPath = '/usuarios/' + login.usuario.id + '/direcciones';
    const syntheticAddress = {
      id: randomUUID(), etiqueta: 'Fixture de integración', direccion: 'Dirección sintética G7',
      departamento: 'Lima', provincia: 'Lima', distrito: 'Lima',
    };
    const created = await check(115, 'Registrar dirección sintética del titular', route, {
      path: ownPath, body: syntheticAddress, token: login.accessToken,
      status: 201, verify: (data) => uuid.test(data?.id ?? '') && typeof data?.direccion === 'string',
    });
    await check(115, 'Listar direcciones del titular', route, {
      path: ownPath, token: login.accessToken, status: 200, example: 'dosDirecciones',
      verify: (data) => Array.isArray(data?.direcciones) &&
        (mock || Boolean(created && data.direcciones.some((address) => address?.id === created.id))),
    });
    await check(115, 'Rechazar lectura de otra fixture autorizada', route, {
      path: '/usuarios/' + c.OTHER_USER_ID + '/direcciones', token: login.accessToken, status: 403, verify: problem('SCOPE_INSUFICIENTE'),
    });
  } else skip(115, 'Alta, lectura y titularidad de direcciones', 'Falta sesión CLIENTE o la segunda fixture coincide.');

  if (login) {
    await check(33, 'Logout de la propia sesión de prueba', '/auth/logout', {
      body: { refreshToken: login.refreshToken }, token: login.accessToken, status: 204, verify: empty,
    });
    if (rows.at(-1).result === 'PASS') {
      await check(33, 'Refresh anterior rechazado tras logout', '/auth/refresh', {
        body: { refreshToken: login.refreshToken }, status: 401, example: 'reusoDetectado', verify: problem('REFRESCO_INVALIDO'),
      });
    } else skip(33, 'Refresh anterior rechazado tras logout', 'El logout previo no quedó confirmado.');
  } else skip(33, 'Logout y revocación del refresh', 'No se obtuvo sesión CLIENTE.');

  await check('transporte', 'Deadline del cliente sobre una lectura aprobada', '/password/politica',
    { status: 200, shortDeadline: true });
  await check('transporte', 'Un retest de lectura con plazo normal', '/password/politica',
    { status: 200, verify: (data) => Number.isInteger(data?.longitudMinima) });
}

async function main() {
  const cfg = configure();
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const startedAt = new Date().toISOString();
  await run(cfg);
  const summary = Object.fromEntries(issues.map((issue) => [issue, {
    passed: rows.filter((row) => row.issue === issue && row.result === 'PASS').length,
    failed: rows.filter((row) => row.issue === issue && row.result === 'FAIL').length,
    skipped: rows.filter((row) => row.issue === issue && row.result === 'SKIP').length,
  }]));
  const folder = 'docs/evidencias/H5/integracion-real/' + startedAt.slice(0, 10);
  const file = folder + '/' + cfg.mode + '-' + startedAt.replaceAll(':', '-') + '-' + randomUUID().slice(0, 8) + '.json';
  await mkdir(folder, { recursive: true });
  await writeFile(file, JSON.stringify({
    mode: cfg.mode, environment: cfg.environment, contract, providerSha: cfg.providerSha, commit: sha,
    startedAt, scope: 'G7 directo. El plazo simula un timeout en el cliente, no un fallo del proveedor.',
    requests, summary, cases: rows,
  }, null, 2) + '\n', { flag: 'wx' });
  const failed = rows.filter((row) => row.result === 'FAIL').length;
  const skipped = rows.filter((row) => row.result === 'SKIP').length;
  console.log(cfg.mode + ': ' + requests + ' solicitudes, ' + failed + ' fallos, ' + skipped + ' omitidos. ' + file);
  if (failed) process.exitCode = 1;
  else if (skipped) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof ConfigurationError ? error.message : 'El kit se detuvo por un error interno. No se imprimen detalles sensibles.');
  process.exitCode = 1;
});
