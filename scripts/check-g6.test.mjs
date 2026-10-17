import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkG6 } from './check-g6.mjs';

const id = '74f32168-513a-4710-8de0-c2221452ba1b';
const card = { productId: 'p1', slug: 'polo', name: 'Polo', categoryId: 'c1', brandId: 'b1', image: null };
function provider({ source = 'REAL', empty = false, status = 200 } = {}) {
  return async (url, options) => {
    assert.equal(new Headers(options.headers).get('Authorization'), null);
    assert.equal(options.redirect, 'error');
    const invalid = url.searchParams.get('q') === 'x';
    const body = invalid ? { code: 'INVALID_SEARCH_QUERY' } : url.pathname.endsWith('/home') ?
      { categories: [{ categoryId: 'c1', name: 'Ropa' }], featuredProducts: [] } :
      { data: empty ? [] : [card], page: { number: 0, size: 4, totalElements: empty ? 0 : 1, totalPages: empty ? 0 : 1 } };
    return Response.json(body, { status: status !== 200 ? status : invalid ? 400 : 200,
      headers: { 'X-Catalog-Source': source, 'X-Request-Id': id, 'Cache-Control': 'no-store' } });
  };
}
test('probe checks anonymous BFF reads, validation and correlation without credentials', async () => {
  const result = await checkG6({ fetchImpl: provider() });
  assert.equal(result.status, 'PASS_READS');
  assert.equal(result.productsOnPage, 1);
  assert.deepEqual(result.correlationIds, [id, id, id]);
});
test('probe refuses MOCK and distinguishes a provider failure from an empty result', async () => {
  await assert.rejects(checkG6({ fetchImpl: provider({ source: 'MOCK' }) }), /CHECK_SOURCE_NOT_REAL/);
  await assert.rejects(checkG6({ fetchImpl: provider({ status: 503 }) }), /CHECK_HTTP_503/);
  assert.equal((await checkG6({ fetchImpl: provider({ empty: true }) })).status, 'PARTIAL_NO_DATA');
});
test('web probe uses Next routes and tolerates older proxies without the optional correlation header', async () => {
  const fake = provider();
  const result = await checkG6({ viaWeb: true, fetchImpl: async (url, options) => {
    assert.ok(url.pathname.startsWith('/api/catalog/'));
    const response = await fake(url, options);
    response.headers.delete('x-request-id');
    return response;
  } });
  assert.equal(result.transport, 'NEXT_TO_BFF');
  assert.deepEqual(result.correlationIds, []);
});
test('probe rejects unsafe targets and invalid queries before any request', async () => {
  const fetchImpl = () => { throw new Error('Must not request'); };
  for (const baseUrl of ['http://remote.example', 'https://user:password@store.example', 'https://store.example/api', 'https://store.example/?token=private']) {
    await assert.rejects(checkG6({ baseUrl, fetchImpl }), /CHECK_INVALID_ORIGIN/);
  }
  await assert.rejects(checkG6({ query: 'x', fetchImpl }), /CHECK_INVALID_QUERY/);
});
test('probe does not accept upstream-only fields in the public card DTO', async () => {
  const fake = provider();
  await assert.rejects(checkG6({ fetchImpl: async (url, options) => {
    const response = await fake(url, options);
    const body = await response.json();
    if (body.data?.length) body.data[0].private_token = 'not-public';
    return Response.json(body, { status: response.status, headers: response.headers });
  } }), /CHECK_PUBLIC_PRODUCT_SHAPE/);
});
