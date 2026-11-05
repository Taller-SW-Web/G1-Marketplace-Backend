import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCatalogH4, validatePage } from './check.mjs';

const card = { productId: 'p1', slug: 'polo', name: 'Polo', categoryId: 'cat', brandId: 'brand', image: null };
const cases = [{ id: 'read', feature: 'F006', async run(c) { c.state.home = await c.get('/home'); } },
  { id: 'dependent', feature: 'F006', async run(c) { c.need('home'); } },
  { id: 'independent', feature: 'F007', async run(c) { await c.get('/products?q=x', 400); } }];
function fixture({ source = 'REAL', status = 200, correlation = true, extra = false, invalidJson = false } = {}) {
  return async (url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit');
    assert.equal(new Headers(options.headers).get('authorization'), null);
    const negative = url.searchParams.get('q') === 'x';
    const body = negative ? { code: 'INVALID_SEARCH_QUERY' } : { categories: [], featuredProducts: [] };
    if (extra) body.internal_token = 'private-value-must-not-appear';
    const headers = { 'x-catalog-source': source, 'cache-control': 'no-store',
      'x-request-id': correlation ? options.headers['X-Request-Id'] : 'different' };
    return invalidJson ? new Response('<private>body</private>', { headers }) : Response.json(body, { headers, status: negative ? 400 : status });
  };
}
test('checks only G1 GETs and never infers grants or deployment from REAL', async () => {
  const report = await checkCatalogH4({ cases, fetchImpl: fixture() });
  assert.equal(report.status, 'PASS'); assert.equal(report.authGrantsVerified, false);
  assert.equal(report.deployedShaVerified, false); assert.equal(report.groupAcceptanceVerified, false);
  assert.equal(report.counts.PASS, 3);
});
test('keeps independent validation cases running after a blocked read', async () => {
  const report = await checkCatalogH4({ cases, fetchImpl: fixture({ status: 503 }) });
  assert.deepEqual(report.results.map(r => r.outcome), ['BLOCKED', 'BLOCKED', 'PASS']);
  assert.equal(report.status, 'PARTIAL');
});
test('MOCK cannot silently satisfy a REAL check', async () => {
  const report = await checkCatalogH4({ cases, fetchImpl: fixture({ source: 'MOCK' }) });
  assert.equal(report.status, 'FAIL'); assert.equal(report.results[0].code, 'SOURCE_MISMATCH');
});
test('correlation and malformed JSON failures are explicit and sanitized', async () => {
  for (const options of [{ correlation: false }, { invalidJson: true }]) {
    const report = await checkCatalogH4({ cases, fetchImpl: fixture(options) });
    assert.equal(report.status, 'FAIL'); assert.ok(!JSON.stringify(report).includes('<private>'));
  }
});
test('rejects unsafe origin and invalid configuration before network', async () => {
  const fetchImpl = () => { throw new Error('must not request'); };
  for (const baseUrl of ['http://remote.example', 'https://user:pass@host.test', 'https://host.test/path', 'https://host.test/?token=x'])
    await assert.rejects(checkCatalogH4({ baseUrl, fetchImpl }));
  await assert.rejects(checkCatalogH4({ query: 'x', fetchImpl }));
  await assert.rejects(checkCatalogH4({ timeoutMs: 999999, fetchImpl }));
});
test('page validation rejects private fields, duplicate IDs and inconsistent totals', () => {
  const page = { sort: null, data: [card], page: { number: 0, size: 4, totalElements: 1, totalPages: 1 } };
  assert.equal(validatePage(page, {}, 'REAL'), page);
  assert.throws(() => validatePage({ ...page, data: [{ ...card, private: true }] }, {}, 'REAL'));
  assert.throws(() => validatePage({ ...page, data: [card, card], page: { ...page.page, totalElements: 2 } }, {}, 'REAL'));
  assert.throws(() => validatePage({ ...page, page: { ...page.page, totalElements: 5 } }, {}, 'REAL'));
});
test('a passing request does not hide insufficient dataset evidence', async () => {
  const report = await checkCatalogH4({ cases: [{ id: 'tie', feature: 'F009', run(c) { c.inconclusive('NO_EQUAL_NAMES_IN_SAMPLE'); } }] });
  assert.equal(report.status, 'PARTIAL'); assert.equal(report.counts.INCONCLUSIVE, 1);
});
test('report excludes query text, credentials and raw private body', async () => {
  const report = await checkCatalogH4({ query: 'private-search-value', cases, fetchImpl: fixture({ status: 503, extra: true }) });
  const text = JSON.stringify(report);
  assert.ok(!text.includes('private-search-value')); assert.ok(!text.includes('private-value-must-not-appear'));
});
