/** Synthetic compact JWT for claims-only tests. Its signature is not valid and must not leave a test. */
export function catalogTestJwt(claims: Record<string, unknown> = {}, nonce = 'fixture'): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [encode({ alg: 'RS256', typ: 'JWT' }), encode({ aud: 'api-productos', scope: 'catalogo:leer', nonce, ...claims }),
    Buffer.from('invalid-test-signature').toString('base64url')].join('.');
}
