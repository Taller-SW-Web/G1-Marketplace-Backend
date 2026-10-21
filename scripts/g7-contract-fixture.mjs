// Local G7 contract double. Not G7, not production, no external accounts or email.
import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';

if (process.env.NODE_ENV === 'production' || process.env.G7_FIXTURE_ACK !== 'local-only') {
  throw new Error('Explicit G7_FIXTURE_ACK=local-only required outside production');
}
const port = Number(process.env.G7_FIXTURE_PORT ?? 4012);
const issuer = `http://127.0.0.1:${port}/api/v1/auth`;
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', use: 'sig', kid: 'g7-fixture-h4' };
const refreshes = new Map(); const challenges = new Map();
function session(id) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({ iss: issuer, sub: id,
    tipo: 'acceso', roles: ['CLIENTE'], permisos: [], email: id === A ? 'a@fixture.test' : 'b@fixture.test', iat: now, exp: now + 900, jti: randomUUID() })}`;
  const refreshToken = randomBytes(32).toString('base64url'); refreshes.set(refreshToken, id);
  return { accessToken: `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`,
    refreshToken, expiresIn: 900, tokenType: 'Bearer', usuario: { id, nombreCompleto: 'Cliente de prueba H4', correo: id === A ? 'a@fixture.test' : 'b@fixture.test', roles: ['CLIENTE'] } };
}
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store');
  const send = (status, body) => { response.statusCode = status; response.end(body === undefined ? undefined : JSON.stringify(body)); };
  try {
    if (request.url === '/live') return send(200, { mode: 'G7-CONTRACT-FIXTURE' });
    if (request.url === '/api/v1/auth/.well-known/jwks.json') return send(200, { keys: [jwk] });
    if (request.url === '/api/v1/password/politica') return send(200, { longitudMinima: 10, requiereMayuscula: true,
      requiereMinuscula: true, requiereDigito: true, requiereCaracterEspecial: true, historial: 5,
      rechazaComunes: true, rechazaDatosPersonales: true });
    let raw = ''; for await (const chunk of request) { raw += chunk; if (raw.length > 4096) return send(413, { code: 'VALIDACION' }); }
    const body = JSON.parse(raw || '{}');
    if (request.url === '/api/v1/auth/registro') {
      if (body.canalOrigen !== 'MARKETPLACE') return send(400, { code: 'VALIDACION' });
      if (body.correo === 'conflict@fixture.test') return send(409, { code: 'CORREO_NO_DISPONIBLE' });
      if (body.contrasena === 'Password2026!') return send(422, { code: 'POLITICA_INCUMPLIDA' });
      return send(201, { id: randomUUID(), estado: 'PENDIENTE_VERIFICACION' });
    }
    if (request.url === '/api/v1/password/recuperar') {
      if (body.correo === 'limit@fixture.test') { response.setHeader('Retry-After', '5'); return send(429, { code: 'DEMASIADAS_SOLICITUDES' }); }
      return send(202);
    }
    if (request.url === '/api/v1/password/restablecer') {
      if (body.token === 'expired-fixture') return send(410, { code: 'TOKEN_RECUPERACION_EXPIRADO' });
      if (body.token !== 'valid-fixture') return send(401, { code: 'TOKEN_RECUPERACION_INVALIDO' });
      if (body.nuevaContrasena === 'Password2026!') return send(422, { code: 'POLITICA_INCUMPLIDA' });
      return send(204);
    }
    if (request.url === '/api/v1/auth/login') {
      if (!['a@fixture.test', 'b@fixture.test', 'mfa@fixture.test'].includes(body.correo)
        || body.contrasena !== 'Fixture-only!123') return send(401, { code: 'CREDENCIALES_INVALIDAS' });
      if (body.correo === 'mfa@fixture.test') {
        const challengeToken = randomBytes(32).toString('base64url'); challenges.set(challengeToken, Date.now() + 300000);
        return send(200, { mfaRequerido: true, challengeToken, canal: 'EMAIL', expiraEn: 300 });
      }
      return send(200, session(body.correo === 'b@fixture.test' ? B : A));
    }
    if (request.url?.startsWith('/api/v1/auth/otp/')) {
      if ((challenges.get(body.challengeToken) ?? 0) < Date.now()) return send(410, { code: 'OTP_EXPIRADO' });
      if (request.url.endsWith('/solicitar')) return send(202, { canal: 'EMAIL', destinoEnmascarado: 'm***@fixture.test', expiraEn: 300, desafioExpiraEn: 300 });
      if (body.codigo !== '123456') return send(401, { code: 'CODIGO_INVALIDO' });
      challenges.delete(body.challengeToken); return send(200, session(A));
    }
    if (request.url === '/api/v1/auth/refresh') {
      const id = refreshes.get(body.refreshToken); if (!id) return send(401, { code: 'REFRESCO_INVALIDO' });
      refreshes.delete(body.refreshToken); return send(200, session(id));
    }
    if (request.url === '/api/v1/auth/logout') { refreshes.delete(body.refreshToken); return send(204); }
    send(404, { code: 'NO_ENCONTRADO' });
  } catch { send(400, { code: 'VALIDACION' }); }
}).listen(port, '127.0.0.1', () => console.log(`G7 CONTRACT FIXTURE (not real G7), loopback port ${port}`));
