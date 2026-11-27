// Runner manual y sanitizado para TASK-H5-TEST-009 (BE #298):
// Verifica conectividad e integración REAL contra los sandboxes de G6, G7, G5 y G2.
// Nunca imprime tokens, cabeceras de autorización, cuerpos de respuesta ni PII.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 15_000;

function validateOrigin(rawUrl) {
  if (!rawUrl?.trim()) return null;
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { error: 'INVALID_URL' };
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((!isLocal && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
    return { error: 'UNSAFE_ORIGIN' };
  }
  return { url: parsed };
}

function buildModuleSpecs(env = process.env) {
  return [
    {
      module: 'G6',
      name: 'Productos y Ofertas',
      baseUrl: env.G6_SANDBOX_URL,
      token: env.G6_SANDBOX_TOKEN,
      apiKey: env.G6_SANDBOX_API_KEY,
      checks: [
        { id: 'G6-POS', label: 'Lectura pública catálogo', path: '/api/v1/catalog/products?page=0&pageSize=1', expectedStatuses: [200] },
        { id: 'G6-NEG', label: 'Parámetro de paginación inválido', path: '/api/v1/catalog/products?page=-1&pageSize=1', expectedStatuses: [400, 422] },
      ],
    },
    {
      module: 'G7',
      name: 'Seguridad / Auth',
      baseUrl: env.G7_SANDBOX_URL,
      token: env.G7_SANDBOX_TOKEN,
      apiKey: env.G7_SANDBOX_API_KEY,
      checks: [
        { id: 'G7-POS', label: 'JWKS / OIDC público', path: '/.well-known/jwks.json', expectedStatuses: [200] },
        { id: 'G7-NEG', label: 'Ruta protegida sin JWT', path: '/api/v1/auth/me', expectedStatuses: [401, 403] },
      ],
    },
    {
      module: 'G5',
      name: 'Ventas / Órdenes',
      baseUrl: env.G5_SANDBOX_URL,
      token: env.G5_SANDBOX_TOKEN,
      apiKey: env.G5_SANDBOX_API_KEY,
      checks: [
        { id: 'G5-POS', label: 'Health / disponibilidad sandbox', path: '/health', expectedStatuses: [200, 204] },
        { id: 'G5-NEG', label: 'Orden protegida sin JWT', path: '/api/v1/orders/00000000-0000-0000-0000-000000000000', expectedStatuses: [401, 403] },
      ],
    },
    {
      module: 'G2',
      name: 'Notificaciones / Correos',
      baseUrl: env.G2_SANDBOX_URL,
      token: env.G2_SANDBOX_TOKEN,
      apiKey: env.G2_SANDBOX_API_KEY,
      checks: [
        { id: 'G2-POS', label: 'Health / disponibilidad sandbox', path: '/health', expectedStatuses: [200, 204] },
        { id: 'G2-NEG', label: 'Recurso protegido sin JWT', path: '/api/v1/notifications/00000000-0000-0000-0000-000000000000', expectedStatuses: [401, 403] },
      ],
    },
  ];
}

async function runCheck(baseUrl, check, { token, apiKey, correlationId, timeoutMs, fetchImpl }) {
  const target = new URL(check.path, baseUrl);
  const headers = {
    Accept: 'application/json',
    'X-Correlation-Id': correlationId,
  };
  if (token?.trim() && check.id.endsWith('-POS')) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  if (apiKey?.trim()) {
    headers['api-key'] = apiKey.trim();
  }

  const startedAt = Date.now();
  let response;
  try {
    response = await fetchImpl(target, {
      method: 'GET',
      headers,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return {
      id: check.id,
      label: check.label,
      path: check.path,
      source: 'NO_DISPONIBLE',
      status: isTimeout ? 'TIMEOUT' : 'TRANSPORT_ERROR',
      httpStatus: null,
      latencyMs: Date.now() - startedAt,
      correlationEchoed: false,
      passed: false,
    };
  }

  const latencyMs = Date.now() - startedAt;
  const echoedCorrelation =
    response.headers?.get?.('x-correlation-id') === correlationId ||
    response.headers?.get?.('x-request-id') === correlationId;

  await response.body?.cancel?.().catch(() => {});

  const passed = check.expectedStatuses.includes(response.status);
  return {
    id: check.id,
    label: check.label,
    path: check.path,
    source: 'REAL',
    status: passed ? 'PASS' : 'FAIL',
    httpStatus: response.status,
    latencyMs,
    correlationEchoed: Boolean(echoedCorrelation),
    passed,
  };
}

export async function runRealSandboxSuite({
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  correlationId = `h5-298-${randomUUID()}`,
} = {}) {
  const specs = buildModuleSpecs(env);
  const timestampUtc = new Date().toISOString();
  const modules = [];

  for (const spec of specs) {
    const originCheck = validateOrigin(spec.baseUrl);
    if (!originCheck) {
      modules.push({
        module: spec.module,
        name: spec.name,
        source: 'NO_DISPONIBLE',
        reason: `Variable ${spec.module}_SANDBOX_URL no configurada`,
        checks: [],
      });
      continue;
    }
    if (originCheck.error) {
      modules.push({
        module: spec.module,
        name: spec.name,
        source: 'NO_DISPONIBLE',
        reason: originCheck.error,
        checks: [],
      });
      continue;
    }

    const checks = [];
    for (const check of spec.checks) {
      checks.push(
        await runCheck(originCheck.url, check, {
          token: spec.token,
          apiKey: spec.apiKey,
          correlationId,
          timeoutMs,
          fetchImpl,
        }),
      );
    }

    const allReal = checks.every((c) => c.source === 'REAL');
    const allPassed = checks.every((c) => c.passed);
    modules.push({
      module: spec.module,
      name: spec.name,
      source: allReal ? 'REAL' : 'NO_DISPONIBLE',
      status: allPassed ? 'PASS' : allReal ? 'FAIL' : 'NO_DISPONIBLE',
      checks,
    });
  }

  return {
    task: 'TASK-H5-TEST-009',
    issue: 'BE #298',
    timestampUtc,
    correlationId,
    piiIncluded: false,
    modules,
  };
}

export function formatMarkdownReport(report) {
  const lines = [
    `# Reporte de Integración REAL contra Sandboxes (${report.issue} / ${report.task})`,
    '',
    `- **Fecha UTC:** \`${report.timestampUtc}\``,
    `- **Correlation ID:** \`${report.correlationId}\``,
    `- **PII / Secretos incluidos:** \`false\` (salida sanitizada)`,
    '',
    '| Módulo | Nombre | Etiqueta | Estado | Detalle de checks |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const mod of report.modules) {
    if (mod.checks.length === 0) {
      lines.push(`| ${mod.module} | ${mod.name} | \`${mod.source}\` | \`NO_DISPONIBLE\` | ${mod.reason} |`);
      continue;
    }
    const detail = mod.checks
      .map((c) => `${c.id}: ${c.status} (HTTP ${c.httpStatus ?? 'N/A'}, ${c.latencyMs}ms, corr=${c.correlationEchoed})`)
      .join('<br>');
    lines.push(`| ${mod.module} | ${mod.name} | \`${mod.source}\` | \`${mod.status}\` | ${detail} |`);
  }

  lines.push('');
  return lines.join('\n');
}

async function main() {
  const report = await runRealSandboxSuite();
  const markdown = formatMarkdownReport(report);
  console.log(markdown);

  const jsonPath = process.env.REAL_SANDBOX_REPORT_JSON;
  const mdPath = process.env.REAL_SANDBOX_REPORT_MD;
  if (jsonPath?.trim()) {
    await mkdir(dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }
  if (mdPath?.trim()) {
    await mkdir(dirname(mdPath), { recursive: true });
    await writeFile(mdPath, markdown, 'utf8');
  }

  const hasFail = report.modules.some((m) => m.status === 'FAIL');
  if (hasFail) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('REAL sandbox verification failed unexpectedly; credentials omitted.');
    process.exitCode = 1;
  });
}
