#!/usr/bin/env node
/**
 * Auditoría de licencias de dependencias de producción (TASK-H5-CICD-004 / Issue #284).
 * 1) Lee package-lock.json y resuelve licencias faltantes (ej. formato legado `licenses: [{ type }]`
 *    de busboy/streamsearch) consultando node_modules/<pkg>/package.json.
 * 2) Guarda el inventario completo de paquetes de producción en licenses-report.json.
 * 3) Bloquea el build si detecta licencias prohibidas (GPL/AGPL/SSPL) o licencias UNKNOWN.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FORBIDDEN_PATTERNS = [/\bAGPL\b/i, /\bGPL-?[23]\b/i, /\bGPL\b/i, /\bSSPL\b/i];

function extractLicenseFromPkgJson(pkgJsonPath) {
  if (!existsSync(pkgJsonPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    if (typeof pkg.license === 'string' && pkg.license.trim()) return pkg.license.trim();
    if (pkg.license && typeof pkg.license === 'object' && typeof pkg.license.type === 'string') {
      return pkg.license.type.trim();
    }
    if (Array.isArray(pkg.licenses) && pkg.licenses.length > 0) {
      const types = pkg.licenses
        .map((entry) => (typeof entry === 'string' ? entry.trim() : entry?.type?.trim()))
        .filter(Boolean);
      if (types.length > 0) return types.join(' OR ');
    }
  } catch {
    return null;
  }
  return null;
}

const lockPath = resolve(process.cwd(), 'package-lock.json');
const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};

const summary = {};
const productionDeps = [];
const blocked = [];
const unknown = [];

for (const [pkgPath, meta] of Object.entries(packages)) {
  if (!pkgPath || pkgPath === '' || meta.dev === true) continue;
  const name = pkgPath.replace(/^.*node_modules\//, '');
  const version = meta.version || 'unknown';

  let license = typeof meta.license === 'string' && meta.license.trim() ? meta.license.trim() : null;
  let source = 'package-lock.json';

  if (!license) {
    const resolved = extractLicenseFromPkgJson(resolve(process.cwd(), pkgPath, 'package.json'));
    if (resolved) {
      license = resolved;
      source = 'node_modules/package.json';
    } else {
      license = 'UNKNOWN';
      source = 'unresolved';
    }
  }

  summary[license] = (summary[license] || 0) + 1;
  const entry = { name, version, license, source };
  productionDeps.push(entry);

  if (license === 'UNKNOWN') {
    unknown.push(entry);
    blocked.push({ ...entry, reason: 'UNKNOWN_LICENSE' });
  } else if (FORBIDDEN_PATTERNS.some((rx) => rx.test(license))) {
    blocked.push({ ...entry, reason: 'FORBIDDEN_COPYLEFT_LICENSE' });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  totalProductionPackages: productionDeps.length,
  licenseSummary: summary,
  unknownCount: unknown.length,
  blockedCount: blocked.length,
  blocked,
  packages: productionDeps,
};

writeFileSync(resolve(process.cwd(), 'licenses-report.json'), JSON.stringify(report, null, 2));
console.log(`Licencias de producción auditadas: ${productionDeps.length} paquetes.`);
console.log('Resumen de licencias:', JSON.stringify(summary, null, 2));

if (blocked.length > 0) {
  console.error('ERROR: Se detectaron licencias prohibidas o UNKNOWN en producción:', JSON.stringify(blocked, null, 2));
  process.exit(1);
}

console.log('OK: Todas las dependencias de producción tienen licencia verificada y permitida (0 UNKNOWN, 0 prohibidas).');
