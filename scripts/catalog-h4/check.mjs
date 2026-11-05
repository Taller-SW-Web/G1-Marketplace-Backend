// Read-only checks of G1 public HTTP. No tokens, cookies, POSTs or direct G6 calls.
import { randomUUID } from 'node:crypto';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export class CheckError extends Error {
  constructor(code, outcome = 'FAIL') { super(code); this.outcome = outcome; }
}
export const requireCheck = (condition, code) => { if (!condition) throw new CheckError(code); };
export const unavailable = code => { throw new CheckError(code, 'BLOCKED'); };
export const inconclusive = code => { throw new CheckError(code, 'INCONCLUSIVE'); };
const PUBLIC_ERRORS = new Set(['INVALID_SEARCH_QUERY', 'INVALID_PAGE', 'INVALID_SORT', 'INVALID_FILTER',
  'INVALID_PRICE_RANGE', 'INVALID_PARAMETERS', 'CATALOG_UNAVAILABLE', 'CATALOG_TIMEOUT', 'NOT_FOUND',
  'METHOD_NOT_ALLOWED', 'ORIGIN_NOT_ALLOWED']);
const ownKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = value => typeof value === 'string' && value.trim().length > 0;

export function validateCard(card, source) {
  requireCheck(ownKeys(card, ['productId', 'slug', 'name', 'categoryId', 'brandId', 'image']), 'PUBLIC_CARD_FIELDS');
  requireCheck(['productId', 'name', 'categoryId', 'brandId'].every(key => text(card[key])) &&
    typeof card.slug === 'string' && card.slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.slug), 'PUBLIC_CARD_IDENTITY');
  if (card.image !== null) {
    requireCheck(ownKeys(card.image, ['url', 'alt']) && text(card.image.alt) && text(card.image.url), 'PUBLIC_IMAGE_FIELDS');
    if (!(source === 'MOCK' && /^\/fixtures\/[A-Za-z0-9_-]+\.svg$/.test(card.image.url))) {
      let url; try { url = new URL(card.image.url); } catch { throw new CheckError('PUBLIC_IMAGE_URL'); }
      requireCheck(url.protocol === 'https:' && !url.username && !url.password, 'PUBLIC_IMAGE_URL');
    }
  }
}
export function validatePage(body, params, source) {
  requireCheck(ownKeys(body, ['sort', 'data', 'page']) && Array.isArray(body.data), 'PUBLIC_PAGE_FIELDS');
  const page = Number(params.page ?? 0), size = Number(params.pageSize ?? 4);
  requireCheck(ownKeys(body.page, ['number', 'size', 'totalElements', 'totalPages']), 'PUBLIC_PAGE_META_FIELDS');
  const total = body.page.totalElements;
  requireCheck(Number.isSafeInteger(total) && total >= 0 && body.page.number === page && body.page.size === size &&
    body.page.totalPages === Math.ceil(total / size) && body.data.length === Math.max(0, Math.min(size, total - page * size)), 'PUBLIC_PAGE_META');
  requireCheck(body.sort === (params.sort ?? null), 'PUBLIC_SORT_META');
  body.data.forEach(card => validateCard(card, source));
  requireCheck(new Set(body.data.map(card => card.productId)).size === body.data.length, 'DUPLICATE_PAGE_PRODUCT');
  return body;
}

async function readJson(response) {
  if (!response.body) throw new CheckError('INVALID_JSON');
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 262144) { await reader.cancel(); throw new CheckError('BODY_LIMIT'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new CheckError('INVALID_JSON'); }
}

export async function checkCatalogH4(options = {}) {
  let base;
  try { base = new URL(options.baseUrl ?? 'http://127.0.0.1:10000'); } catch { throw new CheckError('INVALID_ORIGIN'); }
  const local = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  requireCheck((local || base.protocol === 'https:') && !base.username && !base.password && !base.search && !base.hash && base.pathname === '/', 'INVALID_ORIGIN');
  const source = options.source ?? 'REAL', query = options.query ?? 'running', emptyQuery = options.emptyQuery ?? 'zz-no-match-h4-check';
  const timeoutMs = options.timeoutMs ?? 15000;
  requireCheck(['REAL', 'MOCK'].includes(source), 'INVALID_SOURCE');
  requireCheck([query, emptyQuery].every(q => typeof q === 'string' && Array.from(q).length >= 2 && Array.from(q).length <= 120), 'INVALID_QUERY');
  requireCheck(Number.isSafeInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 30000, 'INVALID_TIMEOUT');
  const fetchImpl = options.fetchImpl ?? fetch;
  const prefix = options.viaWeb ? '/api/catalog' : '/api/v1/catalog';
  const state = {};
  let current;
  const context = {
    source, query, emptyQuery, state, requireCheck, inconclusive,
    need(key) { if (!state[key]) unavailable('DEPENDENCY_' + key.toUpperCase()); return state[key]; },
    async get(path, expected = 200) {
      const requestId = randomUUID(), start = Date.now();
      let response;
      try { response = await fetchImpl(new URL(prefix + path, base), {
        method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
        headers: { Accept: 'application/json', 'X-Request-Id': requestId }, signal: AbortSignal.timeout(timeoutMs),
      }); } catch { unavailable('NETWORK_OR_TIMEOUT'); }
      current.requests.push({ status: response.status, durationMs: Date.now() - start, requestId,
        source: ['REAL', 'MOCK', 'UNCONFIGURED'].includes(response.headers.get('x-catalog-source')) ? response.headers.get('x-catalog-source') : 'MISSING' });
      if (response.status !== expected) {
        if ([401, 403, 404, 429, 500, 502, 503, 504].includes(response.status)) unavailable('HTTP_' + response.status);
        throw new CheckError('HTTP_' + response.status);
      }
      requireCheck(response.headers.get('cache-control') === 'no-store', 'CACHE_POLICY');
      requireCheck(response.headers.get('x-request-id') === requestId, 'CORRELATION');
      if (expected === 200) requireCheck(response.headers.get('x-catalog-source') === source, 'SOURCE_MISMATCH');
      let body;
      try { body = await readJson(response); }
      catch (error) { if (error instanceof CheckError) throw error; unavailable('NETWORK_OR_TIMEOUT'); }
      finally { current.requests[current.requests.length - 1].durationMs = Date.now() - start; }
      if (expected !== 200) requireCheck(PUBLIC_ERRORS.has(body?.code), 'PUBLIC_ERROR_CODE');
      return body;
    },
    async page(params = {}) {
      const criteria = { page: '0', pageSize: '4', ...params };
      const body = await this.get('/products?' + new URLSearchParams(criteria));
      return validatePage(body, criteria, source);
    },
  };
  const cases = options.cases ?? (await Promise.all((await readdir(new URL('./cases/', import.meta.url)))
    .filter(name => /^f\d{3}\.mjs$/.test(name)).sort().map(async name => (await import(new URL('./cases/' + name, import.meta.url))).cases))).flat();
  const results = [];
  for (const item of cases) {
    current = { id: item.id, feature: item.feature, requests: [] };
    try { await item.run(context); current.outcome = 'PASS'; }
    catch (error) {
      current.outcome = error instanceof CheckError ? error.outcome : 'FAIL';
      current.code = error instanceof CheckError && /^[A-Z0-9_]+$/.test(error.message) ? error.message : 'CHECK_FAILED';
    }
    results.push(current);
  }
  const counts = Object.fromEntries(['PASS', 'FAIL', 'BLOCKED', 'INCONCLUSIVE'].map(key => [key, results.filter(r => r.outcome === key).length]));
  return { schema: 1, timestampUtc: new Date().toISOString(), targetOrigin: base.origin,
    transport: options.viaWeb ? 'NEXT_TO_BFF' : 'BFF', expectedSource: source,
    status: counts.FAIL ? 'FAIL' : counts.BLOCKED || counts.INCONCLUSIVE ? 'PARTIAL' : 'PASS', counts, results,
    authGrantsVerified: false, deployedShaVerified: false, groupAcceptanceVerified: false,
    limits: ['Read-only public protocol and observed relationships only.',
      'MOCK is synthetic evidence. REAL header alone does not establish the upstream configuration, grant or deployed SHA.',
      'Global monetary eligibility and stable ordering require owner/dataset evidence beyond this public projection.',
      'No browser interaction, DAST, reservations or order operations are executed.'] };
}

async function main(args) {
  const options = {};
  let output;
  const flags = { '--base-url': 'baseUrl', '--source': 'source', '--query': 'query', '--empty-query': 'emptyQuery', '--timeout-ms': 'timeoutMs' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--via-web') options.viaWeb = true;
    else if (args[i] === '--output' && args[i+1]) output = args[++i];
    else if (flags[args[i]] && args[i+1]) { const key = flags[args[i]]; options[key] = key === 'timeoutMs' ? Number(args[++i]) : args[++i]; }
    else throw new CheckError('INVALID_ARGUMENTS');
  }
  if (output && !/^\.local-security\/catalog-h4-[A-Za-z0-9_-]+\.json$/.test(output)) throw new CheckError('INVALID_OUTPUT_PATH');
  const report = await checkCatalogH4(options);
  if (output) { await mkdir('.local-security', { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'PARTIAL' ? 2 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => {
  console.error(JSON.stringify({ status: 'FAIL', code: error instanceof CheckError ? error.message : 'CHECK_FAILED' }));
  process.exitCode = 1;
});
