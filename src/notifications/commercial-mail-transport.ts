import type { CommercialMailTransport } from './commercial-mail-delivery';

const DEMO_ADDRESS = /^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9.-]+\.invalid$/iu;
const LOCAL_HOSTS = new Set(['127.0.0.1', '[::1]']);
const MESSAGE_ID = /^[a-z0-9_-]{1,128}$/iu;

export function createConfiguredCommercialMailTransport(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): CommercialMailTransport {
  if (env.MAIL_PROVIDER !== 'mailpit') throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');
  if (env.NODE_ENV === 'production') throw new Error('MAILPIT_LOCAL_ONLY');

  const origin = URL.parse(env.MAILPIT_BASE_URL ?? 'http://127.0.0.1:8025');
  if (!origin || origin.protocol !== 'http:' || !LOCAL_HOSTS.has(origin.hostname) ||
      origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('MAILPIT_LOCAL_ONLY');
  }
  const from = env.MAIL_FROM ?? 'marketplace@example.invalid';
  if (!DEMO_ADDRESS.test(from)) throw new Error('MAILPIT_TEST_ADDRESS_REQUIRED');
  const timeoutMs = Number(env.MAIL_TIMEOUT_MS ?? '3000');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error('MAIL_TIMEOUT_INVALID');
  }
  const endpoint = new URL('/api/v1/send', origin);

  return {
    async send({ to, subject, html, text }) {
      if (!DEMO_ADDRESS.test(to)) throw new Error('MAILPIT_TEST_ADDRESS_REQUIRED');
      const signal = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            From: { Email: from },
            To: [{ Email: to }],
            Subject: subject,
            Text: text,
            HTML: html,
          }),
        });
      } catch {
        throw new Error(signal.aborted ? 'MAILPIT_TIMEOUT' : 'MAILPIT_UNAVAILABLE');
      }
      if (!response.ok) throw new Error(`MAILPIT_HTTP_${response.status}`);

      const receipt: unknown = await response.json().catch(() => null);
      if (signal.aborted) throw new Error('MAILPIT_TIMEOUT');
      if (typeof receipt !== 'object' || receipt === null || !('ID' in receipt) ||
          typeof receipt.ID !== 'string' || !MESSAGE_ID.test(receipt.ID)) {
        throw new Error('MAILPIT_INVALID_RESPONSE');
      }
      return { messageId: receipt.ID };
    },
  };
}
