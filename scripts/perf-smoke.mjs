#!/usr/bin/env node
/**
 * Smoke de performance para CI con umbrales bloqueantes (TASK-H5-PERF-004 / Issue #303).
 * - Solo apunta a servicios propios de G1 (endpoints ligeros /health y /docs/specs, sin tocar G6/G7).
 * - Calcula p50, p95, p99, promedio, RPS y tasa de error.
 * - Rompe el job (exit code 1) si p95 supera PERF_MAX_P95_MS o si errorRate supera PERF_MAX_ERROR_RATE.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const ALLOWED_HOST_PATTERNS = [
  /^g1-marketplace-backend\.onrender\.com$/i,
  /^g1-marketplace-backend-[a-z0-9-]+\.onrender\.com$/i,
  /^apim-g1-marketplace-20\.azure-api\.net$/i,
  /^localhost$/i,
  /^127\.0\.0\.1$/,
];

const targetBase = (process.env.PERF_TARGET_URL || 'https://g1-marketplace-backend.onrender.com').replace(/\/$/, '');
const totalRequests = Number(process.env.PERF_REQUESTS || 30);
const concurrency = Number(process.env.PERF_CONCURRENCY || 5);
const maxP95Ms = Number(process.env.PERF_MAX_P95_MS || 1500);
const maxErrorRate = Number(process.env.PERF_MAX_ERROR_RATE || 0.01);
const timeoutMs = Number(process.env.PERF_TIMEOUT_MS || 15000);

const parsed = new URL(targetBase);
if (!ALLOWED_HOST_PATTERNS.some((rx) => rx.test(parsed.hostname))) {
  console.error(`ERROR: Host '${parsed.hostname}' no autorizado. El smoke de performance solo aplica a entornos propios de G1.`);
  process.exit(1);
}

const endpoints = ['/health', '/docs/specs'];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function warmup() {
  for (let i = 1; i <= 5; i++) {
    try {
      const res = await fetch(`${targetBase}/health`, { signal: AbortSignal.timeout(60000) });
      if (res.status === 200) {
        console.log(`Warmup /health OK en intento ${i} (HTTP 200).`);
        return;
      }
      console.log(`Warmup intento ${i} -> HTTP ${res.status}`);
    } catch (err) {
      console.log(`Warmup intento ${i} error: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.error('ERROR: El servicio propio no respondió HTTP 200 durante el warmup.');
  process.exit(1);
}

async function runSmoke() {
  await warmup();

  const latencies = [];
  let errors = 0;
  let nextIndex = 0;
  const startedAt = performance.now();

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= totalRequests) break;
      const path = endpoints[idx % endpoints.length];
      const t0 = performance.now();
      try {
        const res = await fetch(`${targetBase}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
        await res.arrayBuffer();
        const elapsed = performance.now() - t0;
        latencies.push(elapsed);
        if (res.status < 200 || res.status >= 300) errors++;
      } catch {
        const elapsed = performance.now() - t0;
        latencies.push(elapsed);
        errors++;
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const totalDurationSec = (performance.now() - startedAt) / 1000;

  latencies.sort((a, b) => a - b);
  const p50 = Number(percentile(latencies, 50).toFixed(2));
  const p95 = Number(percentile(latencies, 95).toFixed(2));
  const p99 = Number(percentile(latencies, 99).toFixed(2));
  const avg = Number((latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)).toFixed(2));
  const max = Number((latencies[latencies.length - 1] || 0).toFixed(2));
  const errorRate = Number((errors / Math.max(1, totalRequests)).toFixed(4));
  const rps = Number((totalRequests / Math.max(0.001, totalDurationSec)).toFixed(2));

  const p95Passed = p95 <= maxP95Ms;
  const errorPassed = errorRate <= maxErrorRate;
  const passed = p95Passed && errorPassed;

  const report = {
    generatedAt: new Date().toISOString(),
    targetBase,
    endpoints,
    config: { totalRequests, concurrency, maxP95Ms, maxErrorRate },
    metrics: { p50Ms: p50, p95Ms: p95, p99Ms: p99, avgMs: avg, maxMs: max, rps, errors, errorRate },
    thresholds: { p95Passed, errorPassed, passed },
  };

  writeFileSync(resolve(process.cwd(), 'perf-smoke-report.json'), JSON.stringify(report, null, 2));

  const summary = [
    '### Smoke de Performance en CI — TASK-H5-PERF-004',
    `- **Objetivo propio:** \`${targetBase}\` (${endpoints.join(', ')})`,
    `- **Carga:** ${totalRequests} peticiones (concurrencia ${concurrency}) en ${totalDurationSec.toFixed(2)}s (**${rps} RPS**)`,
    '',
    '| Métrica | Valor medido | Umbral | Estado |',
    '| :--- | :---: | :---: | :---: |',
    `| Latencia p50 | ${p50} ms | - | ℹ️ |`,
    `| **Latencia p95** | **${p95} ms** | **≤ ${maxP95Ms} ms** | ${p95Passed ? '✅ PASS' : '❌ FAIL'} |`,
    `| Latencia p99 | ${p99} ms | - | ℹ️ |`,
    `| **Tasa de error** | **${(errorRate * 100).toFixed(2)}%** (${errors}/${totalRequests}) | **≤ ${(maxErrorRate * 100).toFixed(2)}%** | ${errorPassed ? '✅ PASS' : '❌ FAIL'} |`,
  ].join('\n');

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }

  if (!passed) {
    console.error(`FAIL: Se incumplió el umbral de performance (p95=${p95}ms vs <=${maxP95Ms}ms, errorRate=${errorRate} vs <=${maxErrorRate}).`);
    process.exit(1);
  }

  console.log('OK: Todos los umbrales de performance se cumplieron.');
}

runSmoke().catch((err) => {
  console.error('ERROR inesperado en perf-smoke:', err);
  process.exit(1);
});
