#!/usr/bin/env node
/**
 * Auditoría de licencias de dependencias de producción (TASK-H5-CICD-004 / Issue #284).
 * Lee package-lock.json (sin dependencias externas), genera licenses-report.json
 * y bloquea el build si detecta licencias copyleft restringidas (GPL/AGPL/SSPL) en producción.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORBIDDEN_PATTERNS = [/\bAGPL\b/i, /\bGPL-?[23]\b/i, /\bGPL\b/i, /\bSSPL\b/i];

const lockPath = resolve(process.cwd(), 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};

const summary = {};
const productionDeps = [];
const blocked = [];

for (const [pkgPath, meta] of Object.entries(packages)) {
  if (!pkgPath || pkgPath === '' || meta.dev === true) continue;
  const name = pkgPath.replace(/^.*node_modules\//, '');
  const version = meta.version || 'unknown';
  const license = typeof meta.license === 'string' && meta.license.trim() ? meta.license.trim() : 'UNKNOWN';

  summary[license] = (summary[license] || 0) + 1;
  productionDeps.push({ name, version, license });

  const isForbidden = FORBIDDEN_PATTERNS.some((rx) => rx.test(license));
  if (isForbidden) {
    blocked.push({ name, version, license });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  totalProductionPackages: productionDeps.length,
  licenseSummary: summary,
  blockedCount: blocked.length,
  blocked,
};

writeFileSync(resolve(process.cwd(), 'licenses-report.json'), JSON.stringify(report, null, 2));
console.log(`Licencias de producción auditadas: ${productionDeps.length} paquetes.`);
console.log('Resumen de licencias:', JSON.stringify(summary, null, 2));

if (blocked.length > 0) {
  console.error('ERROR: Se detectaron licencias restringidas en producción:', blocked);
  process.exit(1);
}

console.log('OK: Ninguna licencia prohibida (GPL/AGPL/SSPL) en dependencias de producción.');
