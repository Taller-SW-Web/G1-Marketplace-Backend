// Explicit live GET probe. Never loads .env or sends Authorization/cookies.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';

const { values } = parseArgs({ options: { output: { type: 'string' }, consumer: { type: 'boolean' } }, allowPositionals: false });
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('TLS_VERIFICATION_REQUIRED');
const base = 'https://g6-po-axl031-167090a.chilecentral.cloudapp.azure.com';
const report = {
  startedAt: new Date().toISOString(), base, method: 'GET', authorizationSent: false,
  cookiesSent: false, redirectsAllowed: false, tlsVerification: true, cases: [],
};
const isText = value => typeof value === 'string' && value.trim().length > 0;
const distinct = values => new Set(values).size === values.length;
const ids = body => body.items.map(item => item.product_id);
const names = body => body.items.map(item => item.name.toLocaleLowerCase('es'));
const list = params => '/api/v1/productos?' + new URLSearchParams({ canal: 'MARKETPLACE', ...params });
function page(body, pagina, tamanio) {
  assert(Array.isArray(body.items), 'items must be an array');
  assert(Number.isSafeInteger(body.total) && body.total >= 0, 'invalid total');
  assert.equal(body.pagina, pagina, 'wrong pagina');
  assert.equal(body.tamanio, tamanio, 'wrong tamanio');
  assert.equal(body.items.length, Math.max(0, Math.min(tamanio, body.total - (pagina - 1) * tamanio)), 'page count mismatch');
  assert(distinct(ids(body)), 'duplicate product IDs');
  for (const item of body.items) {
    for (const key of ['product_id', 'slug', 'name', 'categoria_id', 'marca_id']) assert(isText(item[key]), 'invalid ' + key);
    assert(item.status === undefined || item.status === 'ACTIVO', 'non-active item exposed');
    if (item.images !== undefined) {
      assert(Array.isArray(item.images), 'invalid images');
      for (const source of item.images) {
        const image = new URL(source);
        assert.equal(image.protocol, 'https:', 'image must use HTTPS');
        assert.equal(image.hostname, 'slzglmtiyrzygpkiuthf.supabase.co', 'unapproved image hostname');
      }
    }
  }
}
async function check(name, path, expectedStatus, validate) {
  const result = { name, url: base + path, expectedStatus, correlationSent: randomUUID() };
  const started = Date.now();
  let body;
  try {
    assert(path === '/health' || path === '/api/v1/categorias' || path === '/api/v1/marcas' ||
      path.startsWith('/api/v1/productos?') || /^\/api\/v1\/productos\/(?:por-slug\/)?[a-z0-9-]+\?canal=MARKETPLACE$/.test(path), 'path outside read scope');
    const response = await fetch(result.url, {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Correlation-Id': result.correlationSent },
      signal: AbortSignal.timeout(15000),
    });
    result.status = response.status;
    result.contentType = response.headers.get('content-type');
    result.correlationReceived = response.headers.get('x-correlation-id');
    assert.equal(response.status, expectedStatus, 'unexpected HTTP status');
    assert(/^application\/(?:json|problem\+json)(?:;|$)/i.test(result.contentType ?? ''), 'expected JSON');
    body = await response.json();
    if (path !== '/health') assert.equal(result.correlationReceived, result.correlationSent, 'correlation mismatch');
    await validate(body, result);
    result.verdict = 'PASS';
  } catch (error) {
    result.verdict = 'FAIL';
    // Record assertion labels/error codes only, never response bodies or credentials.
    result.failure = error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : (error.cause?.code ?? error.name);
  }
  result.durationMs = Date.now() - started;
  report.cases.push(result);
  console.log(JSON.stringify(result));
  return result.verdict === 'PASS' ? body : undefined;
}

await check('gateway-health', '/health', 200, body => assert.equal(body.status, 'ok'));
const categories = await check('categories', '/api/v1/categorias', 200, (body, result) => {
  assert(Array.isArray(body.categories), 'categories must be an array');
  assert(distinct(body.categories.map(item => item.categoria_id)), 'duplicate categories');
  for (const item of body.categories) assert(isText(item.categoria_id) && isText(item.name) && isText(item.status), 'invalid category');
  result.count = body.categories.length;
});
const brands = await check('brands', '/api/v1/marcas', 200, (body, result) => {
  assert(Array.isArray(body.brands), 'brands must be an array');
  assert(distinct(body.brands.map(item => item.marca_id)), 'duplicate brands');
  for (const item of body.brands) assert(isText(item.marca_id) && isText(item.name) && isText(item.status), 'invalid brand');
  result.count = body.brands.length;
});
const baseline = await check('marketplace-default', list({}), 200, (body, result) => {
  page(body, 1, 20); result.count = body.items.length; result.total = body.total;
});
const ascending = await check('name-ascending', list({ pagina: '1', tamanio: '48', orden: 'NOMBRE_ASC' }), 200, (body, result) => {
  page(body, 1, 48); result.count = body.items.length; result.total = body.total;
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  for (let i = 1; i < body.items.length; i++) assert(collator.compare(body.items[i - 1].name, body.items[i].name) <= 0, 'names not ascending');
  if (baseline) assert.equal(body.total, baseline.total, 'total changed across page size');
});
await check('name-descending', list({ pagina: '1', tamanio: '48', orden: 'NOMBRE_DESC' }), 200, (body, result) => {
  page(body, 1, 48); result.count = body.items.length; result.total = body.total;
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  for (let i = 1; i < body.items.length; i++) assert(collator.compare(body.items[i - 1].name, body.items[i].name) >= 0, 'names not descending');
  if (ascending && body.total <= 48) assert.deepEqual(names(body), names(ascending).reverse(), 'descending differs from ascending universe');
});
const first = await check('page-one', list({ pagina: '1', tamanio: '4', orden: 'NOMBRE_ASC' }), 200, (body, result) => {
  page(body, 1, 4); result.total = body.total; result.count = body.items.length;
  if (ascending) assert.deepEqual(ids(body), ids(ascending).slice(0, 4), 'first page differs');
});
await check('page-two', list({ pagina: '2', tamanio: '4', orden: 'NOMBRE_ASC' }), 200, (body, result) => {
  page(body, 2, 4); result.count = body.items.length; result.total = body.total;
  if (first) { assert.equal(body.total, first.total, 'total changed'); assert(ids(body).every(id => !ids(first).includes(id)), 'pages overlap'); }
  if (ascending && body.total <= 48) assert.deepEqual(ids(body), ids(ascending).slice(4, 8), 'second page differs');
});
if (first) {
  const lastPage = Math.max(1, Math.ceil(first.total / 4));
  for (const [label, number] of [['page-last', lastPage], ['page-outside', lastPage + 1]]) {
    await check(label, list({ pagina: String(number), tamanio: '4', orden: 'NOMBRE_ASC' }), 200, (body, result) => {
      page(body, number, 4); assert.equal(body.total, first.total, 'total changed'); result.count = body.items.length; result.total = body.total;
    });
  }
}
await check('search-nike', list({ pagina: '1', tamanio: '48', q: 'Nike', orden: 'NOMBRE_ASC' }), 200, (body, result) => {
  page(body, 1, 48); assert(body.items.every(item => item.name.toLowerCase().includes('nike')), 'search returned unrelated names'); result.count = body.items.length; result.total = body.total;
});
await check('search-empty', list({ pagina: '1', tamanio: '4', q: 'g1-azure-no-product-' + randomUUID() }), 200, body => {
  page(body, 1, 4); assert.equal(body.total, 0, 'expected no matches');
});
const category = categories?.categories.find(item => item.name === 'Balones' && item.status === 'ACTIVA');
const brand = brands?.brands.find(item => item.name === 'Nike' && item.status === 'ACTIVA');
if (category) {
  const params = { pagina: '1', tamanio: '48', categoriaId: category.categoria_id, orden: 'NOMBRE_ASC' };
  await check('category-balones', list(params), 200, (body, result) => {
    page(body, 1, 48); assert(body.items.every(item => item.categoria_id === category.categoria_id), 'category filter ignored'); result.total = body.total; result.count = body.items.length;
  });
  await check('category-search-nike', list({ ...params, q: 'Nike' }), 200, (body, result) => {
    page(body, 1, 48); assert(body.items.every(item => item.categoria_id === category.categoria_id && item.name.toLowerCase().includes('nike')), 'combined category/search ignored'); result.total = body.total; result.count = body.items.length;
  });
  await check('category-price-0-100', list({ ...params, q: 'Nike', precioMin: '0', precioMax: '100' }), 200, (body, result) => {
    page(body, 1, 48); assert(body.items.every(item => item.categoria_id === category.categoria_id), 'category ignored with price'); result.total = body.total; result.count = body.items.length;
    result.priceEligibilityVerified = false; // Public product payload has no price to independently prove eligibility.
  });
}
if (brand) {
  await check('brand-nike', list({ pagina: '1', tamanio: '48', marcaId: brand.marca_id }), 200, (body, result) => {
    page(body, 1, 48); assert(body.items.every(item => item.marca_id === brand.marca_id), 'brand filter ignored'); result.total = body.total; result.count = body.items.length;
  });
}
await check('price-0-100', list({ pagina: '1', tamanio: '48', precioMin: '0', precioMax: '100' }), 200, (body, result) => {
  page(body, 1, 48); result.count = body.items.length; result.total = body.total; result.priceEligibilityVerified = false;
});
const product = ascending?.items.find(item => item.slug === 'nike-academy-hv4386-100') ?? ascending?.items[0] ?? baseline?.items[0];
if (product) {
  for (const [label, path] of [['detail-id', product.product_id], ['detail-slug', 'por-slug/' + product.slug]]) {
    await check(label, '/api/v1/productos/' + path + '?canal=MARKETPLACE', 200, (body, result) => {
      assert.equal(body.product_id, product.product_id, 'detail ID mismatch'); assert.equal(body.slug, product.slug, 'detail slug mismatch');
      assert.equal(body.name, product.name, 'detail name mismatch'); assert(Array.isArray(body.variants), 'variants must be an array');
      assert.equal(body.marca?.marca_id, product.marca_id, 'detail brand mismatch');
      page({ items: [body], total: 1, pagina: 1, tamanio: 1 }, 1, 1);
      result.productId = body.product_id; result.slug = body.slug;
      result.attributesWithoutReadableValue = (body.attributes ?? []).filter(attribute => attribute.valor === null || typeof attribute.valor === 'object' && !isText(attribute.valor?.valor) && !isText(attribute.valor?.value) && !isText(attribute.valor?.nombre)).length;
    });
  }
} else report.positiveDetailPending = 'No published product available from a valid listing';
const missing = randomUUID();
for (const [label, path] of [['missing-id', missing], ['missing-slug', 'por-slug/g1-azure-no-product-' + missing]]) {
  await check(label, '/api/v1/productos/' + path + '?canal=MARKETPLACE', 404, body => {
    assert.equal(body.code, 'PRODUCTO_NO_ENCONTRADO', 'wrong not-found error code');
  });
}
if (values.consumer) {
  const require = createRequire(import.meta.url);
  const { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } = require('../dist/catalog/provider.js');
  const transport = [];
  const provider = createRealProvider({
    NODE_ENV: 'test', CATALOG_SOURCE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
    PRODUCTOS_BASE_URL: base, PRODUCTOS_AUTH_MODE: 'public-read-only', PRODUCTOS_SERVICE_TOKEN: '',
    PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
    PRODUCTOS_MEDIA_HOSTS: 'slzglmtiyrzygpkiuthf.supabase.co', PRODUCTOS_TIMEOUT_MS: '15000',
  }, async (url, options) => {
    assert.equal(url.origin, base, 'consumer called an unexpected origin');
    assert.equal(options.method, 'GET', 'consumer attempted a mutation');
    const headers = new Headers(options.headers);
    assert(!headers.has('authorization') && !headers.has('cookie'), 'consumer attempted to send credentials');
    const response = await fetch(url, options);
    transport.push({ url: url.href, method: options.method, status: response.status,
      authorizationSent: false, correlation: headers.get('x-correlation-id') });
    return response;
  });
  const cases = [
    ['consumer-home', () => provider.home(), body => ({ categories: body.categories.length, featured: body.featuredProducts.length })],
    ['consumer-filters', () => provider.filters(), body => ({ categories: body.categories.length, brands: body.brands.length })],
    ['consumer-search', () => provider.search({ q: 'Nike', page: 0, pageSize: 4, sort: 'NAME_ASC' }), body => ({ count: body.data.length, total: body.page.totalElements })],
    ['consumer-page-two', () => provider.search({ q: 'Nike', page: 1, pageSize: 4, sort: 'NAME_DESC' }), body => ({ count: body.data.length, total: body.page.totalElements })],
  ];
  if (category) cases.push(['consumer-category', () => provider.search({ q: 'Nike', page: 0, pageSize: 4, categoryId: category.categoria_id }), body => {
    assert(body.data.every(item => item.categoryId === category.categoria_id), 'consumer category mismatch');
    return { count: body.data.length, total: body.page.totalElements };
  }]);
  if (brand) cases.push(['consumer-brand', () => provider.search({ q: '', page: 0, pageSize: 4, brandId: brand.marca_id }), body => {
    assert(body.data.every(item => item.brandId === brand.marca_id), 'consumer brand mismatch');
    return { count: body.data.length, total: body.page.totalElements };
  }]);
  for (const [name, execute, validate] of cases) {
    const result = { name, layer: 'G1-real-provider', source: provider.source };
    const started = Date.now();
    try { assert.equal(provider.source, 'REAL'); Object.assign(result, validate(await execute())); result.verdict = 'PASS'; }
    catch (error) { result.verdict = 'FAIL'; result.failure = error.diagnostic ?? error.code ?? error.name; }
    result.durationMs = Date.now() - started; report.cases.push(result); console.log(JSON.stringify(result));
  }
  report.consumerTransport = transport;
}
report.finishedAt = new Date().toISOString();
report.summary = { pass: report.cases.filter(item => item.verdict === 'PASS').length, fail: report.cases.filter(item => item.verdict === 'FAIL').length };
if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, positiveDetailPending: report.positiveDetailPending }));
if (report.summary.fail) process.exitCode = 1;
