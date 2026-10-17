// Directed checks of our own Compose stack. No external service or secret is used.
import assert from 'node:assert/strict';
function loopbackOrigin(value) {
  const url = new URL(value);
  assert.ok(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/');
  return url.origin;
}
const web = loopbackOrigin(process.env.H3_WEB_URL || 'http://127.0.0.1:3000');
const bff = loopbackOrigin(process.env.H3_BFF_URL || 'http://127.0.0.1:10000');
async function json(url, requestId) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000),
    headers: requestId ? { 'X-Request-Id': requestId } : undefined });
  if (requestId) assert.equal(response.headers.get('x-request-id'), requestId, 'Next/BFF correlation');
  assert.equal(response.status, 200, new URL(url).pathname);
  return { response, body: await response.json() };
}
const ready = await json(bff + '/ready');
assert.equal(ready.body.database.connected, true);
const home = await json(web + '/api/catalog/home', 'docker-home-01');
assert.equal(home.response.headers.get('x-catalog-source'), 'MOCK');
assert.equal(home.body.categories.length, 3);
const search = await json(web + '/api/catalog/products?q=running&page=0&pageSize=4', 'docker-search-01');
assert.equal(search.response.headers.get('x-catalog-source'), 'MOCK');
assert.equal(search.body.data.length, 4);
assert.equal(search.body.page.totalElements, 16);
const card = search.body.data[0];
const detail = await json(web + '/api/catalog/products/' + card.slug, 'docker-detail-01');
assert.equal(detail.body.data.productId, card.productId);
assert.equal(detail.body.data.name, card.name);
assert.equal(detail.body.meta.source, 'MOCK');
const notFound = await fetch(web + '/productos/producto-demostracion-99', { signal: AbortSignal.timeout(15000) });
assert.equal(notFound.status, 404, 'Docker server page must consult the internal BFF for unknown products');
const missing = await fetch(web + '/api/catalog/products/producto-demostracion-99', {
  headers: { 'X-Request-Id': 'docker-detail-error-01' }, signal: AbortSignal.timeout(15000),
});
assert.equal(missing.status, 404);
assert.match(missing.headers.get('content-type'), /^application\/problem\+json/);
assert.equal(missing.headers.get('x-request-id'), 'docker-detail-error-01');
const problem = await missing.json();
assert.equal(problem.code, 'PRODUCT_NOT_AVAILABLE');
assert.equal(problem.status, 404);
assert.equal(problem.requestId, 'docker-detail-error-01');
assert.equal(problem.instance, '/api/v1/catalog/products/producto-demostracion-99');
const cart = await json(web + '/api/cart/current');
assert.deepEqual(cart.body.data.items, []);
assert.match(cart.response.headers.get('set-cookie'), /^cart_session=/);
console.log('Docker H3: 7 checks passed (PostgreSQL readiness, correlated Next-to-BFF home/search/detail MOCK, server-side 404, correlated detail Problem Details, anonymous cart).');
