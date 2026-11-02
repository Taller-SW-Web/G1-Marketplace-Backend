import { ConfigService } from '@nestjs/config';
import { G7Client } from './g7.client';

// fetch is mocked: this proves error mapping and limits, not real G7 behavior.
describe('G7Client error mapping (mocked fetch)', () => {
  const make = (env: Record<string, unknown> = {}) => new G7Client({
    get: (key: string, fallback?: unknown) => (({ HTTP_TIMEOUT_MS: 5000, NODE_ENV: 'test', ...env }) as Record<string, unknown>)[key] ?? fallback,
    getOrThrow: (key: string) => (({ G7_API_URL: 'https://g7.example.test/api/v1', ...env }) as Record<string, unknown>)[key],
  } as unknown as ConfigService);
  const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: status >= 200 && status < 300, status, headers: new Headers(headers),
    json: async () => { if (body === undefined) throw new Error('not json'); return body; },
  } as Response);
  const outcome = (promise: Promise<unknown>) => promise.then(() => null, (e) => ({ status: e.getStatus(), body: e.getResponse() }));
  afterEach(() => jest.restoreAllMocks());

  it('maps a network failure or timeout to a generic 503', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new DOMException('aborted', 'TimeoutError'));
    expect(await outcome(make().call('auth/login', {}))).toMatchObject({ status: 503, body: { code: 'AUTH_UNAVAILABLE' } });
  });
  it('sets a timeout signal, no-store and refuses redirects', async () => {
    const spy = reply(200, {}); await make().call('auth/login', { a: 1 });
    expect(spy.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store', method: 'POST' });
    expect((spy.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });
  it.each([['http://g7.example.test/api'], ['https://user:pw@g7.example.test/api'], ['https://g7.example.test/api?x=1'], ['ftp://g7.example.test']])(
    'rejects an unsafe provider URL %s without calling fetch', async (url) => {
      const spy = jest.spyOn(global, 'fetch');
      expect(await outcome(make({ G7_API_URL: url }).call('auth/login', {}))).toMatchObject({ status: 503 });
      expect(spy).not.toHaveBeenCalled();
    });
  it('allows plain http only for loopback outside production', async () => {
    reply(200, { ok: true });
    await expect(make({ G7_API_URL: 'http://127.0.0.1:9/api' }).call('x', {})).resolves.toEqual({ ok: true });
    expect(await outcome(make({ G7_API_URL: 'http://127.0.0.1:9/api', NODE_ENV: 'production' }).call('x', {}))).toMatchObject({ status: 503 });
  });
  it('turns a non-JSON body into 503', async () => {
    reply(200, undefined); expect(await outcome(make().call('x', {}))).toMatchObject({ status: 503 });
  });
  it('forwards only contract codes and never the provider message or detail', async () => {
    reply(401, { code: 'CODIGO_INVALIDO', message: 'user@real.example not found', detail: 'secret' });
    const result = await outcome(make().call('x', {}));
    expect(result).toEqual({ status: 401, body: { code: 'CODIGO_INVALIDO', message: 'No pudimos completar el acceso.' } });
  });
  it('accepts the nested error envelope', async () => {
    reply(410, { error: { code: 'OTP_EXPIRADO' } });
    expect(await outcome(make().call('x', {}))).toMatchObject({ status: 410, body: { code: 'OTP_EXPIRADO' } });
  });
  it('degrades unknown codes: 401 to CREDENCIALES_INVALIDAS, other statuses to 503', async () => {
    reply(401, { code: 'SOMETHING_NEW' }); expect(await outcome(make().call('x', {}))).toMatchObject({ status: 401, body: { code: 'CREDENCIALES_INVALIDAS' } });
    reply(500, { code: 'BOOM' }); expect(await outcome(make().call('x', {}))).toMatchObject({ status: 503, body: { code: 'AUTH_UNAVAILABLE' } });
    reply(403, { code: 'ADMIN_ONLY' }); expect(await outcome(make().call('x', {}))).toMatchObject({ status: 503 });
  });
  it('propagates 429 with a bounded numeric Retry-After only', async () => {
    reply(429, { code: 'RATE_LIMITED' }, { 'retry-after': '30' });
    expect(await outcome(make().call('x', {}))).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED', retryAfterSeconds: 30 } });
    for (const bad of ['Wed, 21 Oct 2026 07:28:00 GMT', '999999', '-1', '1e3']) {
      reply(429, { code: 'RATE_LIMITED' }, { 'retry-after': bad });
      const result = await outcome(make().call('x', {}));
      expect(result!.status).toBe(429);
      expect((result!.body as { retryAfterSeconds?: number }).retryAfterSeconds).toBeUndefined();
    }
  });
  it('treats an unexpected success status as unconfirmed when a status is required', async () => {
    reply(200, {}); expect(await outcome(make().call('x', {}, 't', 202))).toMatchObject({ status: 503 });
  });
});
