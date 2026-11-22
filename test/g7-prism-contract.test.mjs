import assert from 'node:assert/strict';
import { test } from 'node:test';

const realUrl = process.env.G7_CONTRACT_REAL_URL;
const base = (realUrl || 'http://127.0.0.1:4010').replace(/\/$/, '');
const mode = realUrl ? 'REAL (lectura pública)' : 'MOCK Prism';
const contract = 'G7 1.0.0 @ 1b8f2e35448075a6c396b70fdd4ec1d5b1aa9201';

async function request(path, { body, status = 200, example, bearer } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (bearer) headers.Authorization = 'Bearer fixture-prism';
  if (!realUrl) headers.Prefer = [`code=${status}`, example && `example=${example}`].filter(Boolean).join(', ');
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    body: body && JSON.stringify(body),
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, status);
  if (status >= 400) assert.match(response.headers.get('content-type') ?? '', /^application\/problem\+json\b/i);
  const raw = await response.text();
  return raw === '' ? undefined : JSON.parse(raw);
}

function check(name, run) {
  test(`${mode} · referencia ${contract} · ${name}`, run);
}

function noSession(data) {
  assert.ok(!('accessToken' in data) && !('refreshToken' in data));
}

function session(data) {
  assert.ok(typeof data.accessToken === 'string' && data.accessToken.length > 0);
  assert.ok(typeof data.refreshToken === 'string' && data.refreshToken.length > 0);
  assert.equal(data.tokenType, 'Bearer');
  assert.ok(Number.isInteger(data.expiresIn) && data.expiresIn > 0);
  assert.ok(typeof data.usuario?.id === 'string' && Array.isArray(data.usuario?.roles));
}

check('JWKS publica sólo claves públicas de firma RSA', async () => {
  const data = await request('/auth/.well-known/jwks.json', { example: 'rotacion' });
  assert.ok(Array.isArray(data.keys) && data.keys.length > 0);
  if (!realUrl) assert.equal(data.keys.length, 2);
  assert.equal(new Set(data.keys.map(key => key.kid)).size, data.keys.length);
  for (const key of data.keys) {
    assert.equal(key.kty, 'RSA');
    assert.equal(key.alg, 'RS256');
    assert.ok(key.kid && key.n && key.e);
    assert.ok(!['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(field => field in key));
  }
});

check('política de contraseña disponible', async () => {
  const data = await request('/password/politica');
  assert.ok(Number.isInteger(data.longitudMinima) && data.longitudMinima > 0);
});

if (!realUrl) {
  const correo = 'fixture@example.invalid';
  const login = { correo, contrasena: 'SoloFixture23!' };
  const registro = { ...login, nombres: 'Fixture', apellidos: 'Prism', celular: '+51000000000', aceptaTerminos: true, canalOrigen: 'MARKETPLACE' };
  const refresh = { refreshToken: 'fixture-refresh' };
  const challenge = { challengeToken: 'fixture-challenge' };
  const otp = { ...challenge, codigo: '000000' };
  const reset = { token: 'fixture-reset', nuevaContrasena: 'OtraFixture24!' };
  const verify = { token: 'fixture-correo' };
  const usuario = '/usuarios/11111111-1111-1111-1111-111111111111';

  const positives = [
    ['login sin MFA', '/auth/login', { body: login, example: 'sinMfa' }, session],
    ['login exige MFA sin emitir tokens', '/auth/login', { body: login, example: 'conMfa' }, data => {
      assert.equal(data.mfaRequerido, true);
      assert.ok(typeof data.challengeToken === 'string' && data.challengeToken.length > 0);
      noSession(data);
    }],
    ['solicitud OTP', '/auth/otp/solicitar', { body: challenge, status: 202, example: 'enviado' }, data => {
      assert.equal(data.canal, 'EMAIL');
      assert.equal(data.expiraEn, 300);
      noSession(data);
    }],
    ['verificación OTP', '/auth/otp/verificar', { body: otp, example: 'verificado' }, session],
    // Prism sirve el ejemplo. La suite auth-g7.e2e-spec.ts comprueba la rotación con estado.
    ['refresh valida la forma del ejemplo de sesión', '/auth/refresh', { body: refresh, example: 'renovada' }, session],
    ['logout sin contenido', '/auth/logout', { body: refresh, status: 204, bearer: true }],
    ['registro pendiente sin sesión', '/auth/registro', { body: registro, status: 201, example: 'creada' }, data => {
      assert.equal(data.estado, 'PENDIENTE_VERIFICACION');
      assert.ok(typeof data.id === 'string' && data.id.length > 0);
      noSession(data);
    }],
    ['verificación de correo sin contenido', '/auth/verificar-correo', { body: verify, status: 204 }],
    ['reenvío de verificación', '/auth/verificar-correo/reenviar', { body: { correo }, status: 202 }],
    ['recuperación con 202 neutro', '/password/recuperar', { body: { correo }, status: 202 }],
    ['recuperación con otro correo conserva el 202 vacío', '/password/recuperar', { body: { correo: 'otro@example.invalid' }, status: 202 }],
    ['reset sin contenido', '/password/restablecer', { body: reset, status: 204 }],
    ['Usuario con documento enmascarado', usuario, { bearer: true, example: 'sinScopeDocumento' }, data => {
      assert.ok(typeof data.id === 'string' && Array.isArray(data.roles));
      assert.ok(typeof data.documentoEnmascarado === 'string' && !('documento' in data));
    }],
  ];
  for (const [name, path, options, verifyResponse = data => assert.equal(data, undefined)] of positives) {
    check(name, async () => verifyResponse(await request(path, options)));
  }

  const negatives = [
    ['/auth/login', login, 401, 'credencialesInvalidas', 'CREDENCIALES_INVALIDAS'],
    ['/auth/otp/solicitar', challenge, 429, 'demasiadasSolicitudes', 'DEMASIADAS_SOLICITUDES'],
    ['/auth/otp/verificar', otp, 401, 'codigoIncorrecto', 'CODIGO_INVALIDO'],
    ['/auth/otp/verificar', otp, 401, 'intentosAgotados', 'OTP_INTENTOS_AGOTADOS'],
    ['/auth/otp/verificar', otp, 410, 'codigoVencido', 'OTP_EXPIRADO'],
    ['/auth/refresh', refresh, 401, 'reusoDetectado', 'REFRESCO_INVALIDO'],
    ['/auth/logout', refresh, 401, 'tokenInvalido', 'TOKEN_INVALIDO'],
    ['/auth/registro', registro, 409, 'correoNoDisponible', 'CORREO_NO_DISPONIBLE'],
    ['/auth/registro', registro, 422, 'cortaYSinSimbolo', 'POLITICA_INCUMPLIDA'],
    ['/auth/verificar-correo', verify, 410, 'expirado', 'ENLACE_EXPIRADO'],
    ['/auth/verificar-correo', verify, 410, 'yaUsado', 'ENLACE_YA_USADO'],
    ['/auth/verificar-correo/reenviar', { correo }, 429, 'demasiadas', 'DEMASIADAS_SOLICITUDES'],
    ['/password/recuperar', { correo }, 429, 'demasiadas', 'DEMASIADAS_SOLICITUDES'],
    ['/password/restablecer', reset, 401, 'tokenInvalido', 'TOKEN_RECUPERACION_INVALIDO'],
    ['/password/restablecer', reset, 410, 'tokenExpirado', 'TOKEN_RECUPERACION_EXPIRADO'],
    ['/password/restablecer', reset, 422, 'cortaYSinSimbolo', 'POLITICA_INCUMPLIDA'],
    ['/auth/.well-known/jwks.json', undefined, 503, 'noDisponible', 'NO_DISPONIBLE'],
    [usuario, undefined, 401, 'tokenInvalido', 'TOKEN_INVALIDO'],
  ];
  for (const [path, body, status, example, code] of negatives) {
    const route = path === usuario ? '/usuarios/{id}' : path;
    check(`${route} devuelve ${status} ${code}`, async () => {
      const data = await request(path, { body, status, example });
      assert.equal(data.status, status);
      assert.equal(data.code, code);
      noSession(data);
    });
  }
}
