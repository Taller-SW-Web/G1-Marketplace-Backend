/**
 * Verificación sanitizada de políticas Azure APIM (BE #312 / TASK-H5-APIM-007).
 * Requiere APIM_SUBSCRIPTION_KEY en el entorno (no se persisten claves en código ni logs).
 */
import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.APIM_BASE_URL ?? 'https://apim-g1-marketplace-20.azure-api.net/v1').replace(/\/$/, '');
const subscriptionKey = process.env.APIM_SUBSCRIPTION_KEY ?? '';
const runRateLimit = process.env.APIM_RUN_RATE_LIMIT === 'true';

async function callApim(path, headers = {}) {
  const correlationId = headers['X-Correlation-Id'] ?? `apim-312-${randomUUID().slice(0, 8)}`;
  const reqHeaders = {
    'X-Correlation-Id': correlationId,
    ...(subscriptionKey ? { 'Ocp-Apim-Subscription-Key': subscriptionKey } : {}),
    ...headers,
  };
  const started = Date.now();
  const res = await fetch(`${baseUrl}${path}`, { headers: reqHeaders });
  const elapsedMs = Date.now() - started;
  return {
    status: res.status,
    elapsedMs,
    correlationOut: res.headers.get('x-correlation-id'),
    retryAfter: res.headers.get('retry-after'),
    cacheStatus: res.headers.get('x-cache') ?? res.headers.get('cache-control'),
  };
}

async function main() {
  console.log(`Target APIM: ${baseUrl}`);

  const unauth = await callApim('/cart');
  console.log('1) 401 policy check (/cart sin JWT):', JSON.stringify(unauth));

  const trace = await callApim('/health', { 'X-Correlation-Id': 'apim-312-trace-check' });
  console.log('2) Trace header check (/health):', JSON.stringify(trace));

  const miss = await callApim('/catalog/home');
  const hit = await callApim('/catalog/home');
  console.log('3) Cache check (/catalog/home 1st vs 2nd):', JSON.stringify({ first: miss, second: hit }));

  if (runRateLimit) {
    if (!subscriptionKey) throw new Error('APIM_SUBSCRIPTION_KEY is required when APIM_RUN_RATE_LIMIT=true');
    const summary = { ok200: 0, limited429: 0, other: 0, sampleRetryAfter: null };
    for (let i = 1; i <= 65; i += 1) {
      const r = await callApim('/health');
      if (r.status === 200) summary.ok200 += 1;
      else if (r.status === 429) {
        summary.limited429 += 1;
        summary.sampleRetryAfter ??= r.retryAfter;
      } else summary.other += 1;
    }
    console.log('4) Rate-limit 429 burst (65 reqs):', JSON.stringify(summary));
  } else {
    console.log('4) Rate-limit 429 burst skipped (set APIM_RUN_RATE_LIMIT=true with APIM_SUBSCRIPTION_KEY)');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
