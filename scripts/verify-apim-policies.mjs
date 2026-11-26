/** Verifica las políticas del gateway APIM publicadas para BE #312. */
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const subscriptionKey = process.env.APIM_SUBSCRIPTION_KEY?.trim();
const runRateLimit = process.env.APIM_RUN_RATE_LIMIT === 'true';
const cachePath = process.env.APIM_CACHE_PATH ?? '/docs/specs';
const jwtRejection = 'Acceso no autorizado: Token JWT invalido, expirado o ausente';

async function callApim(baseUrl, path, timeoutMs = 10_000) {
  const correlationId = `apim-312-${randomUUID()}`;
  const timestamp = new Date().toISOString();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'api-key': subscriptionKey, 'X-Correlation-Id': correlationId },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  });
  const body = await response.text();
  return {
    timestamp,
    status: response.status,
    correlationIn: correlationId,
    correlationOut: response.headers.get('x-correlation-id'),
    requestId: response.headers.get('x-request-id'),
    retryAfter: response.headers.get('retry-after'),
    cacheStatus: response.headers.get('x-cache'),
    jwtRejected: response.status === 401 && body.includes(jwtRejection)
      && !/AzureApiManagementKey/i.test(response.headers.get('www-authenticate') ?? ''),
  };
}

async function main() {
  if (!subscriptionKey) throw new Error('Configura APIM_SUBSCRIPTION_KEY con una suscripción válida.');
  if (!['/docs/specs', '/health'].includes(cachePath)) throw new Error('APIM_CACHE_PATH debe ser /docs/specs o /health.');
  const base = new URL(process.env.APIM_BASE_URL ?? 'https://apim-g1-marketplace-20.azure-api.net/v1');
  if (base.username || base.password || base.search || base.hash) throw new Error('APIM_BASE_URL debe contener solo el origen y la ruta de la API.');
  const baseUrl = base.href.replace(/\/$/, '');
  const call = (path) => callApim(baseUrl, path);
  const failures = [];
  function check(name, passed, evidence) {
    console.log(JSON.stringify({ check: name, result: passed ? 'pass' : 'fail', ...evidence }));
    if (!passed) failures.push(name);
  }

  const health = await callApim(baseUrl, '/health', 45_000);
  check('subscription', health.status === 200, health);
  if (health.status !== 200) throw new Error('La suscripción debe obtener HTTP 200 en /health para continuar.');

  const jwt = await call('/cart');
  check('jwt', jwt.jwtRejected, jwt);
  check('trace', jwt.jwtRejected && jwt.correlationOut === jwt.correlationIn, jwt);

  const attempts = [await call(cachePath)];
  for (let i = 1; i < 4 && attempts.at(-1).status === 200; i += 1) {
    await delay(250);
    const sample = await call(cachePath);
    attempts.push(sample);
    if (sample.cacheStatus === 'HIT') break;
  }
  check('cache', attempts.length >= 2 && attempts.every(({ status }) => status === 200)
    && attempts.at(-1).cacheStatus === 'HIT', { path: cachePath, attempts });

  if (runRateLimit) {
    let ok200 = 0;
    let sample;
    for (let i = 0; i < 65; i += 1) {
      sample = await call('/health');
      if (sample.status !== 200) break;
      ok200 += 1;
    }
    check('rate-limit', sample?.status === 429 && /^\d+$/.test(sample.retryAfter ?? ''), { ok200, sample });
  } else {
    console.log(JSON.stringify({ check: 'rate-limit', result: 'skipped' }));
  }

  if (failures.length) throw new Error(`Comprobaciones fallidas: ${failures.join(', ')}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
