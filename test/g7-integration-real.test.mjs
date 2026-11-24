import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mfaChallenge, otpRequested } from '../scripts/g7-integration-real.mjs';

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
