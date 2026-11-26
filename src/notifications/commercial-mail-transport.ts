import { isEmail } from 'class-validator';
import type { CommercialMailTransport } from './commercial-mail-delivery';

const DEMO_ADDRESS = /^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9.-]+\.invalid$/iu;
const LOCAL_HOSTS = new Set(['127.0.0.1', '[::1]']);
const MESSAGE_ID = /^[a-z0-9_-]{1,128}$/iu;
const BREVO_ENDPOINT = new URL('https://api.brevo.com/v3/smtp/email');
const BREVO_MESSAGE_ID = /^[\x21-\x7e]{1,512}$/u;

export function createConfiguredCommercialMailTransport(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): CommercialMailTransport {
  if (env.MAIL_PROVIDER === 'brevo') {
    if (env.BREVO_ENABLED !== 'true') throw new Error('BREVO_DISABLED');
    return createBrevoTransport(env, fetchImpl);
  }
  if (env.MAIL_PROVIDER !== 'mailpit') throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');
  if (env.NODE_ENV === 'production') throw new Error('MAILPIT_LOCAL_ONLY');

  const origin = URL.parse(env.MAILPIT_BASE_URL ?? 'http://127.0.0.1:8025');
  if (!origin || origin.protocol !== 'http:' || !LOCAL_HOSTS.has(origin.hostname) ||
      origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('MAILPIT_LOCAL_ONLY');
  }
  const from = env.MAIL_FROM ?? 'marketplace@example.invalid';
  if (!DEMO_ADDRESS.test(from)) throw new Error('MAILPIT_TEST_ADDRESS_REQUIRED');
  const timeoutMs = mailTimeout(env);
  const endpoint = new URL('/api/v1/send', origin);

  return {
    async send({ to, subject, html, text }) {
      if (!DEMO_ADDRESS.test(to)) throw new Error('MAILPIT_TEST_ADDRESS_REQUIRED');
      const receipt = await postMail(fetchImpl, endpoint, timeoutMs, 'MAILPIT', {
        From: { Email: from },
        To: [{ Email: to }],
        Subject: subject,
        Text: text,
        HTML: html,
      });
      return { messageId: readMessageId(receipt.body, 'ID', MESSAGE_ID, 'MAILPIT'), httpStatus: receipt.httpStatus };
    },
  };
}

function createBrevoTransport(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch): CommercialMailTransport {
  const apiKey = env.BREVO_API_KEY?.trim();
  if (!apiKey) throw new Error('BREVO_API_KEY_REQUIRED');
  const from = env.BREVO_SENDER_EMAIL?.trim();
  if (!from || !isEmail(from)) throw new Error('BREVO_SENDER_REQUIRED');
  const timeoutMs = mailTimeout(env);

  return {
    async send({ to, subject, html, text }) {
      if (!isEmail(to)) throw new Error('BREVO_RECIPIENT_INVALID');
      const receipt = await postMail(fetchImpl, BREVO_ENDPOINT, timeoutMs, 'BREVO', {
        sender: { email: from },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }, { 'api-key': apiKey });
      return {
        messageId: readMessageId(receipt.body, 'messageId', BREVO_MESSAGE_ID, 'BREVO'),
        httpStatus: receipt.httpStatus,
      };
    },
  };
}

function mailTimeout(env: NodeJS.ProcessEnv): number {
  const timeoutMs = Number(env.MAIL_TIMEOUT_MS ?? '3000');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new Error('MAIL_TIMEOUT_INVALID');
  }
  return timeoutMs;
}

type Provider = 'MAILPIT' | 'BREVO';

async function postMail(
  fetchImpl: typeof fetch,
  endpoint: URL,
  timeoutMs: number,
  provider: Provider,
  payload: object,
  headers: Record<string, string> = {},
): Promise<{ body: unknown; httpStatus: number }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(signal.aborted ? `${provider}_TIMEOUT` : `${provider}_UNAVAILABLE`);
  }
  if (!response.ok) throw new Error(`${provider}_HTTP_${response.status}`);
  const receipt: unknown = await response.json().catch(() => null);
  if (signal.aborted) throw new Error(`${provider}_TIMEOUT`);
  return { body: receipt, httpStatus: response.status };
}

function readMessageId(receipt: unknown, field: 'ID' | 'messageId', pattern: RegExp, provider: Provider) {
  const id = typeof receipt === 'object' && receipt !== null
    ? (receipt as Record<string, unknown>)[field]
    : undefined;
  if (typeof id !== 'string' || !pattern.test(id)) {
    throw new Error(`${provider}_INVALID_RESPONSE`);
  }
  return id;
}
