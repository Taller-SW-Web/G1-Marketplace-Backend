// Directed checks of our own Compose stack. No external service or secret is used.
import assert from 'node:assert/strict';
const web = 'http://127.0.0.1:3000';
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, new URL(url).pathname);
  return { response, body: await response.json() };
}
const ready = await json('http://127.0.0.1:10000/ready');
assert.equal(ready.body.database.connected, true);
const home = await json(web + '/api/catalog/home');
assert.equal(home.response.headers.get('x-catalog-source'), 'MOCK');
assert.equal(home.body.categories.length, 3);
const search = await json(web + '/api/catalog/products?q=running&page=0&pageSize=4');
assert.equal(search.response.headers.get('x-catalog-source'), 'MOCK');
assert.equal(search.body.data.length, 4);
assert.equal(search.body.page.totalElements, 16);
const cart = await json(web + '/api/cart/current');
assert.deepEqual(cart.body.data.items, []);
assert.match(cart.response.headers.get('set-cookie'), /^cart_session=/);
console.log('Docker H3: 4 checks passed (PostgreSQL readiness, Next-to-BFF home/search MOCK, anonymous cart).');
