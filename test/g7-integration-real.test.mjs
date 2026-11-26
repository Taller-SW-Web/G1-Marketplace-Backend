import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mfaChallenge, otpRequested, run } from '../scripts/g7-integration-real.mjs';

for (const [name, verify, fixture] of [
  ['desafío MFA', mfaChallenge, { mfaRequerido: true, challengeToken: 'desafio-del-doble' }],
  ['solicitud OTP', otpRequested, { canal: 'EMAIL' }],
]) {
  test(name + ' rechaza cualquier campo de sesión en la respuesta del doble', async () => {
    const double = (body) => Response.json(body).json();
    assert.equal(verify(await double(fixture)), true);
    for (const tokenField of ['accessToken', 'refreshToken']) {
      assert.equal(verify(await double({ ...fixture, [tokenField]: 'valor-del-doble' })), false);
      assert.equal(verify(await double({ ...fixture, [tokenField]: null })), false);
    }
  });
}

const manual = {
  mock: false, manualMail: true, base: 'http://127.0.0.1',
  credentials: {
    REGISTER_EMAIL: 'registro@example.invalid', TEST_EMAIL: 'cliente@example.invalid',
    MFA_EMAIL: 'mfa@example.invalid', NEW_PASSWORD: 'fixture-new',
  },
};

test('MOCK: correo manual encadena registro, MFA y reset sin preprovisionar tokens', async () => {
  const calls = [];
  const inputs = ['doble-correo-alta', '123456', 'doble-correo-reset'];
  const prompts = [];
  const ownerId = '11111111-1111-1111-1111-111111111111';
  const addressId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const session = { accessToken: 'doble-access', refreshToken: 'doble-refresh', tokenType: 'Bearer',
    usuario: { id: ownerId, roles: ['CLIENTE'] } };
  const request = async (url, options) => {
    const path = new URL(url).pathname;
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, body });
    const status = (code) => new Response(null, { status: code });
    const json = (data, code = 200) => Response.json(data, { status: code });
    switch (path) {
      case '/auth/registro': return calls.length === 1
        ? json({ id: ownerId, estado: 'PENDIENTE_VERIFICACION' }, 201)
        : json({ code: 'CORREO_NO_DISPONIBLE' }, 409);
      case '/auth/verificar-correo': return status(204);
      case '/auth/login':
        if (body.correo === manual.credentials.MFA_EMAIL) return json({ mfaRequerido: true, challengeToken: 'doble-desafio' });
        return calls.filter((call) => call.path === path).length === 2
          ? json({ code: 'CREDENCIALES_INVALIDAS' }, 401) : json(session);
      case '/auth/otp/solicitar': return json({ canal: 'EMAIL' }, 202);
      case '/auth/otp/verificar': return json(session);
      case '/auth/logout': return status(204);
      case '/auth/refresh': return json({ code: 'REFRESCO_INVALIDO' }, 401);
      case '/password/recuperar': return status(202);
      case '/password/restablecer':
        return calls.filter((call) => call.path === path).length === 1
          ? status(204) : json({ code: 'TOKEN_RECUPERACION_INVALIDO' }, 401);
      case '/usuarios/' + ownerId + '/direcciones': return options.method === 'POST'
        ? json({ id: addressId, direccion: 'Fixture' }, 201) : json({ direcciones: [{ id: addressId }] });
      default: throw new Error('Solicitud inesperada del doble');
    }
  };
  const report = await run(manual, {
    request,
    readSecret: async () => { prompts.push(calls.at(-1).path); return inputs.shift(); },
  });
  assert.deepEqual(prompts, ['/auth/registro', '/auth/otp/solicitar', '/password/recuperar']);
  assert.equal(calls.find((call) => call.path === '/auth/verificar-correo').body.token, 'doble-correo-alta');
  assert.equal(calls.find((call) => call.path === '/auth/otp/verificar').body.codigo, '123456');
  assert.equal(calls.find((call) => call.path === '/password/restablecer').body.token, 'doble-correo-reset');
  assert.ok(calls.findIndex((call) => call.path === '/auth/refresh') < calls.findIndex((call) => call.path === '/password/recuperar'));
  assert.equal(calls.filter((call) => call.path === '/password/recuperar').length, 1);
  assert.equal(calls.filter((call) => call.path === '/auth/otp/solicitar').length, 1);
  assert.equal(calls.some((call) => call.path === '/password/politica'), false);
  assert.equal(report.requests, 18);
  assert.equal(report.stopped, false);
  assert.equal(report.rows.filter((row) => row.result === 'FAIL').length, 0);
  assert.equal(report.rows.filter((row) => row.result === 'SKIP').length, 5);
  assert.ok(!/doble-correo|doble-access|doble-refresh|123456/.test(JSON.stringify(report)));
});

test('MOCK: 429 conserva Retry-After y corta la ronda sin peticiones ni prompts posteriores', async () => {
  const result = await run(manual, {
    request: async () => Response.json({ code: 'DEMASIADAS_SOLICITUDES', detail: 'texto del doble' },
      { status: 429, headers: { 'Retry-After': '120' } }),
    readSecret: async () => assert.fail('No se debe pedir una credencial tras 429'),
  });
  assert.equal(result.stopped, true);
  assert.equal(result.requests, 1);
  assert.deepEqual(result.rows[0].retryAfter, { seconds: 120 });
  assert.equal(result.rows[0].errorCode, 'DEMASIADAS_SOLICITUDES');
  assert.equal(result.rows[0].httpStatus, 429);
  assert.equal(result.rows.filter((row) => row.result === 'SKIP').length, 6);
  assert.ok(!JSON.stringify(result).includes('texto del doble'));
});
