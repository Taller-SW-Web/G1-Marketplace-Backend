// Read-only probe of OUR BFF/web. The G6 technical token stays in the BFF.
import { pathToFileURL } from 'node:url';

export async function checkG6({ baseUrl = 'http://127.0.0.1:10000', query = '', viaWeb = false, fetchImpl = fetch } = {}) {
  let base;
  try { base = new URL(baseUrl); } catch { throw new Error('CHECK_INVALID_ORIGIN'); }
  const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((!localHttp && base.protocol !== 'https:') || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('CHECK_INVALID_ORIGIN');
  }
  if (query && (Array.from(query).length < 2 || Array.from(query).length > 120)) throw new Error('CHECK_INVALID_QUERY');
  const prefix = viaWeb ? '/api/catalog' : '/api/v1/catalog';
  const correlations = [];
  async function get(path, expected = 200) {
    let response;
    try {
      response = await fetchImpl(new URL(path, base), {
        headers: { Accept: 'application/json' }, redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
    } catch { throw new Error('CHECK_NETWORK_FAILED'); }
    if (response.status !== expected) throw new Error(`CHECK_HTTP_${response.status}`);
    if (response.headers.get('x-catalog-source') !== 'REAL') throw new Error('CHECK_SOURCE_NOT_REAL');
    if (response.headers.get('cache-control') !== 'no-store') throw new Error('CHECK_CACHE_POLICY');
    const id = response.headers.get('x-request-id');
    // The current Next proxy does not forward this header. Direct BFF probing requires it.
    if (!viaWeb && !id) throw new Error('CHECK_CORRELATION_MISSING');
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('CHECK_CORRELATION_INVALID');
    if (id) correlations.push(id);
    try { return await response.json(); } catch { throw new Error('CHECK_INVALID_JSON'); }
  }
  const home = await get(`${prefix}/home`);
  if (!Array.isArray(home?.categories) || !Array.isArray(home?.featuredProducts)) throw new Error('CHECK_HOME_SHAPE');
  const params = new URLSearchParams({ page: '0', pageSize: '4' });
  if (query) params.set('q', query);
  const products = await get(`${prefix}/products?${params}`);
  if (!Array.isArray(products?.data) || products.page?.number !== 0 || products.page?.size !== 4 ||
      !Number.isSafeInteger(products.page.totalElements) || products.page.totalElements < products.data.length ||
      products.data.length > 4 || products.page.totalPages !== Math.ceil(products.page.totalElements / 4)) {
    throw new Error('CHECK_PAGE_SHAPE');
  }
  const keys = ['productId', 'slug', 'name', 'categoryId', 'brandId', 'image'];
  for (const product of products.data) {
    if (!product || Object.keys(product).length !== keys.length || !keys.every((key) => Object.hasOwn(product, key)) ||
        !keys.slice(0, 5).every((key) => typeof product[key] === 'string' && product[key].length > 0)) {
      throw new Error('CHECK_PUBLIC_PRODUCT_SHAPE');
    }
  }
  const invalid = await get(`${prefix}/products?q=x`, 400);
  if (invalid?.code !== 'INVALID_SEARCH_QUERY') throw new Error('CHECK_VALIDATION_FAILED');
  const hasData = home.categories.length > 0 && products.data.length > 0;
  return {
    status: hasData ? 'PASS_READS' : 'PARTIAL_NO_DATA', transport: viaWeb ? 'NEXT_TO_BFF' : 'BFF',
    source: 'REAL', categories: home.categories.length, productsOnPage: products.data.length,
    totalProducts: products.page.totalElements, correlationIds: correlations,
    // Source=REAL means the adapter ran; it does not establish which upstream was configured.
    scope: 'Pair with approved upstream configuration and sanitized BFF/G6 correlation evidence. No approval, deployment or grant is inferred.',
  };
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--via-web') options.viaWeb = true;
    else if (args[i] === '--base-url' && args[i + 1]) options.baseUrl = args[++i];
    else if (args[i] === '--query' && args[i + 1]) options.query = args[++i].trim();
    else throw new Error('CHECK_INVALID_ARGUMENTS');
  }
  const result = await checkG6(options);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'PASS_READS') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    // Never print raw response bodies, exceptions, URLs with credentials or process.env.
    const code = typeof error?.message === 'string' && /^CHECK_[A-Z0-9_]+$/.test(error.message) ? error.message : 'CHECK_FAILED';
    console.error(JSON.stringify({ status: 'FAIL', code }));
    process.exitCode = 1;
  });
}
