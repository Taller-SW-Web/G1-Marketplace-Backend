import { request } from 'node:http';
import { performance } from 'node:perf_hooks';

const baseUrl = new URL(process.env.PERF_BASE_URL ?? 'http://127.0.0.1:10000');
const requests = Number(process.env.PERF_REQUESTS ?? 200);
const concurrency = Number(process.env.PERF_CONCURRENCY ?? 20);
const encodings = (process.env.PERF_ENCODINGS ?? 'identity,gzip')
  .split(',')
  .map((encoding) => encoding.trim())
  .filter(Boolean);
const paths = [
  '/api/v1/catalog/home',
  '/api/v1/catalog/products?q=running&pageSize=48',
];

// Use IP literals so a hosts/DNS override cannot map an accepted name off-loopback.
if (baseUrl.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(baseUrl.hostname)) {
  throw new Error('Local benchmark only: PERF_BASE_URL must use HTTP on loopback.');
}
if (!Number.isInteger(requests) || requests < 1 || requests > 10000) {
  throw new Error('PERF_REQUESTS must be an integer from 1 to 10000.');
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) {
  throw new Error('PERF_CONCURRENCY must be an integer from 1 to 100.');
}
if (encodings.length === 0 || encodings.some((encoding) => !['identity', 'gzip'].includes(encoding))) {
  throw new Error('PERF_ENCODINGS must be a comma-separated list containing identity and/or gzip.');
}

function percentile(sorted, value) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] ?? 0;
}

function getOnce(path, acceptEncoding, requestId) {
  const startedAt = performance.now();
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, baseUrl), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': acceptEncoding,
        'X-Request-Id': requestId,
      },
    }, (res) => {
      let wireBytes = 0;
      res.on('data', (chunk) => { wireBytes += chunk.length; });
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        wireBytes,
        contentEncoding: String(res.headers['content-encoding'] ?? 'identity'),
        cacheControl: String(res.headers['cache-control'] ?? ''),
        latencyMs: performance.now() - startedAt,
      }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Local benchmark request timed out.')));
    req.on('error', reject);
    req.end();
  });
}

async function measure(path, acceptEncoding) {
  const latencies = [];
  const statuses = {};
  const contentEncodings = {};
  let wireBytes = 0;
  let cacheControl = '';
  let nextRequest = 0;
  const startedAt = performance.now();
  const workerCount = Math.min(concurrency, requests);

  await Promise.all(Array.from({ length: workerCount }, async (_, worker) => {
    while (true) {
      const sequence = nextRequest++;
      if (sequence >= requests) return;
      const response = await getOnce(path, acceptEncoding, `perf-${worker}-${sequence}`);
      latencies.push(response.latencyMs);
      statuses[response.status] = (statuses[response.status] ?? 0) + 1;
      contentEncodings[response.contentEncoding] = (contentEncodings[response.contentEncoding] ?? 0) + 1;
      wireBytes += response.wireBytes;
      cacheControl = response.cacheControl;
    }
  }));

  const elapsedMs = performance.now() - startedAt;
  latencies.sort((left, right) => left - right);
  const failures = requests - (statuses[200] ?? 0);
  const result = {
    path,
    acceptEncoding,
    requests,
    concurrency: workerCount,
    failures,
    statuses,
    elapsedMs: Number(elapsedMs.toFixed(1)),
    requestsPerSecond: Number((requests * 1000 / elapsedMs).toFixed(1)),
    latencyMs: {
      p50: Number(percentile(latencies, 0.50).toFixed(2)),
      p95: Number(percentile(latencies, 0.95).toFixed(2)),
      p99: Number(percentile(latencies, 0.99).toFixed(2)),
    },
    totalWireBytes: wireBytes,
    averageWireBytes: Math.round(wireBytes / requests),
    contentEncodings,
    cacheControl,
  };
  console.log(JSON.stringify(result));
  if (failures > 0) process.exitCode = 1;
}

for (const path of paths) {
  for (const encoding of encodings) {
    await measure(path, encoding);
  }
}
