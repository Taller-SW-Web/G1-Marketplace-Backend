import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = readFileSync(resolve(root, 'azure-apim/policies/api-policy.xml'), 'utf8');
const catalog = JSON.parse(readFileSync(resolve(root, 'docs/contratos/openapi-catalogo-h4.json'), 'utf8'));
const docs = readFileSync(resolve(root, 'docs/APIM-POLICY-H5-310.md'), 'utf8');
const runbook = readFileSync(resolve(root, 'azure-apim/README.md'), 'utf8');
const cicd = readFileSync(resolve(root, '.github/workflows/cicd.yml'), 'utf8');
const qaSmoke = readFileSync(resolve(root, 'scripts/apim-qa-smoke.mjs'), 'utf8');

test('canonical develop policy is reused instead of adding a duplicate policy', () => {
  assert.match(policy, /<cors\b/u);
  assert.match(policy, /<rate-limit\b/u);
  assert.match(policy, /<validate-jwt\b/u);
  assert.match(policy, /<set-header\s+name="X-Correlation-Id"/u);
  assert.doesNotMatch(policy, /<\/?\s*cache-[\w-]+\b/iu);
  assert.doesNotMatch(policy, /<set-header\s+name="(?:Cache-Control|X-Cache)"/iu);
  assert.doesNotMatch(policy, /<rewrite-uri\b/iu, 'this issue must not duplicate APIM routing policy');
  assert.match(docs, /does not add a second APIM policy/iu);
});

test('public X-Correlation-Id is aliased to X-Request-Id upstream and returned publicly', () => {
  const inbound = policy.match(/<inbound>([\s\S]*?)<\/inbound>/u)?.[1] ?? '';
  const outbound = policy.match(/<outbound>([\s\S]*?)<\/outbound>/u)?.[1] ?? '';
  assert.match(inbound, /set-header\s+name="X-Correlation-Id"[\s\S]*?Regex\.IsMatch\([\s\S]*?\[A-Za-z0-9\._-\]\{1,64\}\$[\s\S]*?set-header\s+name="X-Request-Id"\s+exists-action="override"[\s\S]*?GetValueOrDefault\("X-Correlation-Id"/u);
  assert.match(outbound, /set-header\s+name="X-Correlation-Id"/u);
  assert.match(docs, /X-Correlation-Id[\s\S]*safe `\[A-Za-z0-9\._-\]\{1,64\}` format[\s\S]*X-Request-Id[\s\S]*BFF/u);
  assert.match(runbook, /X-Correlation-Id.*X-Request-Id/u);
});

test('the catalog contract exposes exactly the three public GET operations', () => {
  const contractPublicGets = Object.entries(catalog.paths)
    .filter(([, pathItem]) => pathItem.get && Array.isArray(pathItem.get.security) && pathItem.get.security.length === 0)
    .map(([path]) => path)
    .sort();
  assert.deepEqual(contractPublicGets, [
    '/api/v1/catalog/filters',
    '/api/v1/catalog/home',
    '/api/v1/catalog/products',
  ]);
  for (const path of contractPublicGets) {
    assert.equal(catalog.paths[path].get.security.length, 0, `${path} must remain explicitly public`);
  }
});

test('runtime contract and canonical APIM policy do not activate or report cache behavior', () => {
  const publicGets = Object.values(catalog.paths)
    .filter((pathItem) => pathItem.get?.security?.length === 0)
    .map((pathItem) => pathItem.get);
  assert.ok(publicGets.length > 0, 'catalog contract must expose its public GET operations');
  for (const operation of publicGets) {
    assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
  }
  const runtime = readFileSync(resolve(root, 'src/catalog/catalog-request.interceptor.ts'), 'utf8');
  assert.match(runtime, /setHeader\('Cache-Control', 'no-store'\)/u);
  assert.doesNotMatch(policy, /<\/?\s*cache-[\w-]+\b/iu, 'policy must not use APIM cache policy elements');
  assert.doesNotMatch(policy, /<set-header\s+name="(?:Cache-Control|X-Cache)"/iu, 'policy must not override cache directives or report cache outcomes');
  assert.doesNotMatch(policy, /\b(?:HIT|MISS)\b/iu, 'policy must not force or claim cache outcomes');
  assert.match(docs, /no cache lookup or cache\s+store/u);
  assert.match(docs, /PR #345 separately prepares an\s+in-process cache candidate; it now defaults `CATALOG_CACHE_TTL_MS` to `0`/u);
});

test('documentation records current APIM status without treating it as policy validation or permission', () => {
  assert.match(docs, /#307 was closed[\s\S]*APIM\s+Consumption is Online/iu);
  assert.match(docs, /23 November 2026/u);
  assert.match(docs, /has \*\*not\*\* been validated in the instance/iu);
  assert.match(docs, /Do not deploy without express authorization/iu);
});

test('subscription-key configuration remains external and contains no key value', () => {
  assert.match(docs, /current header is\s+`api-key`/u);
  assert.match(docs, /`web-frontend-g1`[\s\S]*`APIM_SUBSCRIPTION_KEY`/u);
  assert.match(docs, /`ci-qa-smoke`[\s\S]*`APIM_QA_SUBSCRIPTION_KEY`/u);
  assert.match(docs, /`demo-team`[\s\S]*outside Git/u);
  assert.match(runbook, /-H "api-key: \$KEY"/u);
  assert.doesNotMatch(docs + runbook, /Ocp-Apim-Subscription-Key/u);
  assert.match(docs, /key \*\*values\*\* only in the approved secret\s+store/u);
  assert.match(docs, /Values remain only in their approved secret\s+stores/u);
  assert.doesNotMatch(docs, /Blocked: APIM #307 pending/u);
  assert.doesNotMatch(docs, /(?:SharedAccessSignature|DefaultEndpointsProtocol|Bearer\s+[A-Za-z0-9._~-]{20,})/u);
});

test('APIM QA smoke is opt-in, bounded, read-only, and does not print secret or response data', () => {
  assert.match(cicd, /workflow_dispatch:[\s\S]*apim_qa_smoke:[\s\S]*RUN_APIM_QA_SMOKE/u);
  assert.match(cicd, /if: github\.event_name == 'workflow_dispatch'[\s\S]*apim_qa_smoke == 'RUN_APIM_QA_SMOKE'/u);
  assert.match(cicd, /APIM_QA_SUBSCRIPTION_KEY: \$\{\{ secrets\.APIM_QA_SUBSCRIPTION_KEY \}\}/u);
  assert.match(qaSmoke, /method: 'GET'/u);
  assert.match(qaSmoke, /catalog\/products\?page=0&pageSize=10/u);
  assert.match(qaSmoke, /path: 'wishlist'[\s\S]*expectedStatus: 401/u);
  assert.match(qaSmoke, /AbortSignal\.timeout\(45_000\)/u);
  assert.doesNotMatch(qaSmoke, /console\.(?:log|error)\([^\n]*(?:subscriptionKey|response\.text|response\.json)/u);
  assert.match(docs, /exactly two[\s\S]*GETs/u);
  assert.match(docs, /Real QA attempt — 25 Nov 2026 UTC[\s\S]*Both requests\s+returned `404`[\s\S]*failed REAL gateway check/u);
  assert.match(docs, /`X-Correlation-Id` matched[\s\S]*`X-Request-Id` did not/u);
  assert.match(runbook, /RUN_APIM_QA_SMOKE/u);
});
