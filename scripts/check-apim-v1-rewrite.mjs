import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policy = readFileSync(resolve(root, 'docs/apim/v1-backend-rewrite.policy.xml'), 'utf8');
const docs = readFileSync(resolve(root, 'docs/apim/H5-308-IMPORT-V1.md'), 'utf8');
const openapi = readFileSync(resolve(root, 'docs/apim/marketplace-bff-v1.subset.openapi.yaml'), 'utf8');

assert.match(policy, /<rewrite-uri\s+template='@\("\/api" \+ context\.Request\.OriginalUrl\.Path\)'\s+copy-unmatched-params="true"\s*\/>/u);
assert.match(policy, /<inbound>\s*<base\s*\/>\s*<rewrite-uri/u);
assert.match(policy, /Candidate only for API scope marketplace-api with public suffix \/v1/u);
assert.match(policy, /confirmed origin-root serviceUrl documented in H5-308-IMPORT-V1\.md/u);

const paths = [...openapi.matchAll(/^  "(\/v1[^"]+)":\s*$/gmu)].map((match) => match[1]);
assert.equal(paths.length, 32, 'rewrite candidate should target the contracted /v1 path surface only');
assert.ok(paths.every((path) => path === '/v1' || path.startsWith('/v1/')));
assert.ok(!paths.includes('/v1/health'), '/v1/health must remain outside the contracted API');
assert.ok(!paths.includes('/v1/docs') && !paths.some((path) => path.startsWith('/v1/docs/')), '/v1/docs must remain outside the contracted API');
assert.equal('/api' + '/v1/catalog/products', '/api/v1/catalog/products');
assert.equal('/api' + '/v1/catalog/products?page=0&pageSize=10', '/api/v1/catalog/products?page=0&pageSize=10');
assert.equal('/api' + '/v1/checkout/orders', '/api/v1/checkout/orders');
assert.match(docs, /`marketplace-api` \/ `v1`/u);
assert.match(docs, /https:\/\/g1-marketplace-backend\.onrender\.com` \(origen, sin prefijo de ruta\)/u);
assert.match(docs, /`GET \/v1\/catalog\/products\?page=0&pageSize=10`/u);
assert.match(docs, /`GET \/v1\/wishlist`[\s\S]*requiere Bearer/u);
assert.match(docs, /`GET \/v1\/carts\/current` permite sesión anónima/u);
assert.match(docs, /no hay operación `\/v1\/health`[\s\S]*`\/api\/v1\/health`/u);
assert.match(docs, /Si el `serviceUrl` cambia o ya incluye `\/api`, no aplicar el candidato/u);
assert.match(docs, /not executed nor validated in an APIM gateway|no se ejecutó ni validó en un gateway APIM/iu);
assert.doesNotMatch(policy, /https?:\/\//u, 'candidate must not invent a backend host');

console.log(`Offline rewrite candidate checks passed for ${paths.length} OpenAPI paths; no APIM call performed.`);
