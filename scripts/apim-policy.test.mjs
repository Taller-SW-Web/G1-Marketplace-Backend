import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = readFileSync(resolve(root, 'infra/apim/policies/catalog-api.xml'), 'utf8');
const catalog = JSON.parse(readFileSync(resolve(root, 'docs/contratos/openapi-catalogo-h4.json'), 'utf8'));
const docs = readFileSync(resolve(root, 'docs/APIM-POLICY-H5-310.md'), 'utf8');

function policyScopePaths() {
  const match = policy.match(/<set-variable name="catalogCacheScope"[\s\S]*?\/>/u);
  assert.ok(match, 'policy must define the catalog cache-scope expression');
  return [...match[0].matchAll(/&quot;(\/api\/v1\/catalog\/[a-z-]+)&quot;/gu)].map((item) => item[1]);
}

function yamlPaths(relativePath) {
  const source = readFileSync(resolve(root, relativePath), 'utf8');
  return [...source.matchAll(/^ {2}(\/[^:\s]+):\s*$/gmu)].map((item) => item[1]);
}

test('cache candidate allowlist is exactly the public GET catalog contract', () => {
  const contractPublicGets = Object.entries(catalog.paths)
    .filter(([, pathItem]) => pathItem.get && Array.isArray(pathItem.get.security) && pathItem.get.security.length === 0)
    .map(([path]) => path)
    .sort();
  const scopedPaths = policyScopePaths();

  assert.equal(scopedPaths.length, new Set(scopedPaths).size, 'scope paths must be unique');
  assert.deepEqual([...scopedPaths].sort(), contractPublicGets);
  for (const path of scopedPaths) {
    assert.equal(catalog.paths[path].get.security.length, 0, `${path} must remain explicitly public`);
  }
});

test('detail, commercial, checkout, and account contract paths stay outside scope', () => {
  const scoped = new Set(policyScopePaths());
  const excludedContracts = [
    'docs/contratos/product-detail-h4.openapi.yaml',
    'docs/contratos/checkout-h4.openapi.yaml',
    'docs/contratos/auth-h4.openapi.yaml',
  ];

  for (const contract of excludedContracts) {
    for (const path of yamlPaths(contract)) {
      assert.equal(scoped.has(path), false, `${path} from ${contract} must not be cache-scoped`);
    }
  }

  const h3 = JSON.parse(readFileSync(resolve(root, 'docs/contratos/openapi-h3.json'), 'utf8'));
  for (const path of Object.keys(h3.paths)) {
    assert.equal(scoped.has(path), false, `${path} from the cart/favorites contract must not be cache-scoped`);
  }
});

test('scope accepts only GET and bypasses authenticated or cookie-bearing requests', () => {
  const match = policy.match(/<set-variable name="catalogCacheScope"[\s\S]*?\/>/u);
  assert.ok(match);
  assert.match(match[0], /context\.Request\.Method\s*==\s*&quot;GET&quot;/u);
  assert.match(match[0], /!context\.Request\.Headers\.ContainsKey\(&quot;Authorization&quot;\)/u);
  assert.match(match[0], /!context\.Request\.Headers\.ContainsKey\(&quot;Cookie&quot;\)/u);
});

test('request ID is safely preserved or replaced and returned unchanged', () => {
  assert.ok(policy.includes('Regex.IsMatch(supplied, &quot;^[A-Za-z0-9._-]{1,64}$&quot;)'));
  assert.ok(policy.includes('context.RequestId.ToString()'));
  const setHeaders = [...policy.matchAll(/<set-header\s+name="([^"]+)"/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(setHeaders)], ['X-Request-Id'], 'only the demonstrated public request ID header is set');
  assert.equal(setHeaders.length, 3);
  assert.match(policy, /<value>@\(\(string\)context\.Variables\[&quot;requestId&quot;\]\)<\/value>/u);
  assert.match(docs, /disagreement over using `correlation-id`[\s\S]*contract decision/u);
});

test('cache is intentionally disabled while the contract says no-store', () => {
  const publicGets = Object.values(catalog.paths)
    .filter((pathItem) => pathItem.get?.security?.length === 0)
    .map((pathItem) => pathItem.get);
  assert.ok(publicGets.length > 0, 'catalog contract must expose its public GET operations');
  for (const operation of publicGets) {
    assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
  }
  const runtime = readFileSync(resolve(root, 'src/catalog/catalog-request.interceptor.ts'), 'utf8');
  assert.match(runtime, /setHeader\('Cache-Control', 'no-store'\)/u);
  assert.match(policy, /Cache-Control: no-store/u);
  assert.doesNotMatch(policy, /<\/?\s*cache-[\w-]+\b/iu, 'candidate must not use APIM cache policy elements');
  assert.doesNotMatch(policy, /<set-header\s+name="(?:Cache-Control|X-Cache)"/iu, 'candidate must not override cache directives or report cache outcomes');
  assert.doesNotMatch(policy, /\b(?:HIT|MISS)\b/iu, 'candidate must not force or claim cache outcomes');
  assert.match(policy, /no active cache lookup or cache store/iu);
  assert.match(docs, /no active cache lookup or cache store/u);
});

test('documentation records current APIM status without treating it as policy validation or permission', () => {
  assert.match(docs, /#307 was closed[\s\S]*APIM\s+Consumption is Online/iu);
  assert.match(docs, /23 November 2026/u);
  assert.match(docs, /has \*\*not\*\* been validated in that\s+instance/iu);
  assert.match(docs, /Do not deploy without express authorization/iu);
});

test('policy and documentation contain no subscription key value', () => {
  assert.match(docs, /Ocp-Apim-Subscription-Key/u);
  assert.ok(docs.includes('key **values** only in the approved secret store'));
  assert.match(docs, /`<consumer identity to be approved>`[\s\S]*`<provision in APIM>`[\s\S]*`<external secret reference>`/u);
  assert.doesNotMatch(docs, /Blocked: APIM #307 pending/u);
  assert.doesNotMatch(`${policy}\n${docs}`, /(?:SharedAccessSignature|DefaultEndpointsProtocol|Bearer\s+[A-Za-z0-9._~-]{20,})/u);
});
