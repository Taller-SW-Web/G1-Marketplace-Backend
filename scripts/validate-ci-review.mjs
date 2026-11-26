#!/usr/bin/env node
/** Static regression checks for the PR #359 CI/CD review findings. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const read = (file) => readFileSync(file, 'utf8');
const workflow = (file) => yaml.load(read(file));
const cicd = workflow('.github/workflows/cicd.yml');
const dast = workflow('.github/workflows/dast-zap.yml');
const perf = workflow('.github/workflows/perf-smoke.yml');

const policy = read('azure-apim/policies/api-policy.xml');
assert.match(policy, /context\.Request\.Url\.Path\.Substring\(3\)/, 'APIM must strip public /v1 from health/docs routes');
assert.match(policy, /@\("\/api" \+ context\.Request\.Url\.Path\)/, 'APIM must replace public /v1 with backend /api/v1');
assert.doesNotMatch(policy, /@\("\/api\/v1" \+ context\.Request\.Url\.Path\)/, 'APIM must not prepend a duplicate /v1 prefix');

const deploy = cicd.jobs['deploy'];
assert.ok(deploy, 'single deploy job must exist');
assert.equal(deploy.environment, 'production');
assert.equal(cicd.jobs['deploy-staging'], undefined, 'single deploy path must not duplicate deploy-staging');
assert.equal(cicd.jobs['deploy-production'], undefined, 'single deploy path must not duplicate deploy-production');

const imageSteps = cicd.jobs['docker-image'].steps;
const buildIndex = imageSteps.findIndex((step) => step.uses?.startsWith('docker/build-push-action@'));
const scanIndex = imageSteps.findIndex((step) => step.name?.includes('escanear la imagen local'));
const publishIndex = imageSteps.findIndex((step) => step.name === 'Publicar etiquetas del release en GHCR');
assert.ok(buildIndex >= 0 && scanIndex > buildIndex && publishIndex > scanIndex, 'release image must be built, scanned, then pushed');
assert.equal(imageSteps[buildIndex].with.load, true);
assert.equal(imageSteps[buildIndex].with.push, false);
assert.match(imageSteps[scanIndex].run, /--exit-code 1/);
assert.doesNotMatch(imageSteps.slice(0, publishIndex).map((step) => step.run || '').join('\n'), /docker push/);

assert.equal(dast.on.workflow_dispatch.inputs.target_url.default, '');
assert.equal(dast.jobs['owasp-zap-baseline'].environment, 'pruebas');
assert.match(dast.jobs['owasp-zap-baseline'].env.TARGET_URL, /vars\.BACKEND_STAGING_URL/);
assert.doesNotMatch(dast.jobs['owasp-zap-baseline'].env.TARGET_URL, /g1-marketplace-backend\.onrender\.com/);
const dastText = read('.github/workflows/dast-zap.yml');
assert.match(dastText, /zap-api-scan\.py/);
assert.match(dastText, /-f openapi -S/);
assert.match(dastText, /spec\.servers = \[\{ url: process\.env\.TARGET_URL \}\]/);
assert.match(dastText, /-r "\/zap\/wrk\/zap-api-\$name\.html" -J "\/zap\/wrk\/zap-api-\$name\.json"/, 'ZAP API reports must be written to the mounted artifact directory');

assert.match(perf.jobs['perf-smoke'].env.PERF_TARGET_URL, /vars\.BACKEND_STAGING_URL/);
assert.equal(perf.jobs['perf-smoke'].environment, 'pruebas');
assert.doesNotMatch(perf.jobs['perf-smoke'].env.PERF_TARGET_URL, /g1-marketplace-backend\.onrender\.com/);
const perfScript = read('scripts/perf-smoke.mjs');
assert.match(perfScript, /PERF_TARGET_URL debe configurarse explícitamente/);
assert.match(perfScript, /parsed\.hostname\.toLowerCase\(\) === 'g1-marketplace-backend\.onrender\.com'/);
for (const target of ['', 'https://g1-marketplace-backend.onrender.com']) {
  const result = spawnSync(process.execPath, ['scripts/perf-smoke.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, PERF_TARGET_URL: target },
  });
  assert.equal(result.status, 1, `performance smoke must reject target ${target || '(empty)'} without making network calls`);
}

console.log('OK: gates CI/CD revisados (APIM, staging/prod, Trivy-before-publish, DAST y performance).');
