// Explicit public-demo reads only; no credentials, private endpoints or production configuration writes.
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { catalogTimings } from './timings.mjs';

export async function measureG6Public({ baseUrl, profile = 'integration', samples = 1, query = 'Nike', fetchImpl = fetch } = {}) {
  let base; try { base = new URL(baseUrl); } catch { throw new Error('INVALID_MEASUREMENT_ORIGIN'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/')
    throw new Error('INVALID_MEASUREMENT_ORIGIN');
  if (!Number.isSafeInteger(samples) || samples < 1 || samples > 3 || typeof query !== 'string' ||
      Array.from(query).length < 2 || Array.from(query).length > 120) throw new Error('INVALID_MEASUREMENT_INPUT');
  const timing = catalogTimings(profile);
  const operations = [
    ['search', { q: query, pagina: '1' }],
    ['sort', { orden: 'NOMBRE_ASC', pagina: '1' }],
    ['page2', { orden: 'NOMBRE_ASC', pagina: '2' }],
  ];
  const results = [];
  for (let sample = 1; sample <= samples; sample++) for (const [operation, params] of operations) {
    const requestId = randomUUID(), start = performance.now();
    let status = 'NETWORK_OR_TIMEOUT';
    try {
      const url = new URL('/api/v1/productos', base);
      url.search = new URLSearchParams({ canal: 'MARKETPLACE', tamanio: '4', ...params });
      const response = await fetchImpl(url, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
        headers: { Accept: 'application/json', 'X-Correlation-Id': requestId }, signal: AbortSignal.timeout(timing.providerMs) });
      status = response.status;
      if (response.body) {
        const reader = response.body.getReader(); let size = 0;
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.length;
          if (size > 262144) { await reader.cancel(); throw new Error('MEASUREMENT_BODY_LIMIT'); }
        }
      }
    } catch { if (typeof status === 'number') status = 'RESPONSE_NOT_COMPLETED'; }
    const elapsedMs = Math.round(performance.now() - start);
    results.push({ operation, sample, status, elapsedMs, requestId,
      successfulWithinFiveSeconds: status === 200 && elapsedMs <= timing.providerTargetMs,
      successfulWithinIntegrationBudget: status === 200 && elapsedMs <= timing.providerMs });
  }
  return { timestampUtc: new Date().toISOString(), targetOrigin: base.origin, profile, timing, results,
    mode: 'PUBLIC_DEMO_WITHOUT_JWT', grantVerified: false, targetAcceptedByG6: false,
    limits: 'Bounded observations, not p95/SLO certification. A fast error does not satisfy the five-second target. No query text or response payload is retained.' };
}

async function main(args) {
  if (!args.includes('--public-demo')) throw new Error('PUBLIC_DEMO_OPT_IN_REQUIRED');
  const options = {};
  for (let i=0;i<args.length;i++) {
    if (args[i] === '--public-demo') continue;
    const keys = { '--base-url': 'baseUrl', '--profile': 'profile', '--samples': 'samples', '--query': 'query' };
    const key = keys[args[i]];
    if (!key || !args[i+1]) throw new Error('INVALID_MEASUREMENT_ARGUMENTS');
    options[key] = key === 'samples' ? Number(args[++i]) : args[++i];
  }
  const report = await measureG6Public(options);
  console.log(JSON.stringify(report, null, 2));
  if (report.results.some(result => result.status !== 200)) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => {
  const code = typeof error.message === 'string' && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'MEASUREMENT_FAILED';
  console.error(JSON.stringify({ status: 'FAIL', code })); process.exitCode = 1;
});
