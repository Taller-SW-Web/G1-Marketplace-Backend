import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = readFileSync(resolve(root, 'azure-apim/policies/api-policy.xml'), 'utf8');
const catalog = JSON.parse(readFileSync(resolve(root, 'docs/contratos/openapi-catalogo-h4.json'), 'utf8'));
const docs = readFileSync(resolve(root, 'docs/APIM-POLICY-H5-310.md'), 'utf8');

test('canonical develop policy is reused instead of adding a duplicate policy', () => {
  assert.match(policy, /<cors\b/u);
  assert.match(policy, /<rate-limit\b/u);
  assert.match(policy, /<validate-jwt\b/u);
  assert.match(policy, /<set-header\s+name="X-Correlation-Id"/u);
  assert.doesNotMatch(policy, /<\/?\s*cache-[\w-]+\b/iu);
  assert.doesNotMatch(policy, /<set-header\s+name="(?:Cache-Control|X-Cache)"/iu);
  assert.doesNotMatch(policy, /<rewrite-uri\b/iu, 'this issue must not duplicate APIM routing policy');
  assert.match(docs, /does not add a second APIM policy or change that\s+shared policy/iu);
});

test('public header mismatch is documented without inventing an alias', () => {
  assert.match(policy, /name="X-Correlation-Id"/u);
  assert.match(docs, /BFF emits `X-Request-Id`, while the canonical\s+APIM policy emits `X-Correlation-Id`/u);
  assert.match(docs, /does not invent an alias or change the public contract/u);
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
  assert.match(docs, /has \*\*not\*\* been validated in that\s+instance/iu);
  assert.match(docs, /Do not deploy without express authorization/iu);
});

test('subscription-key configuration remains external and contains no key value', () => {
  assert.match(docs, /Ocp-Apim-Subscription-Key/u);
  assert.ok(docs.includes('key **values** only in the approved secret store'));
  assert.match(docs, /`<consumer identity to be approved>`[\s\S]*`<provision in APIM>`[\s\S]*`<external secret reference>`/u);
  assert.doesNotMatch(docs, /Blocked: APIM #307 pending/u);
  assert.doesNotMatch(docs, /(?:SharedAccessSignature|DefaultEndpointsProtocol|Bearer\s+[A-Za-z0-9._~-]{20,})/u);
});
