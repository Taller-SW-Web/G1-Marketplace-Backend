import { CatalogError, problem } from './errors';
import { createProvider, createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { createMockProvider } from './fixtures';
import { CatalogService } from './catalog.service';
import { parseQuery } from './query';

const config = { CATALOG_SOURCE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
  PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_AUTH_MODE: 'service-token',
  PRODUCTOS_SERVICE_TOKEN: 'synthetic-token', PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
  PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION };
const query = (value = '') => parseQuery(new URLSearchParams(value));
const emptyPage = () => Response.json({ items: [], total: 0, pagina: 1, tamanio: 24 });

describe('H4 reviewer corrections', () => {
  it('fails closed before any request when production selects demo-no-auth', async () => {
    const fetcher = jest.fn(async () => emptyPage());
    const env = { ...config, NODE_ENV: 'production', PRODUCTOS_AUTH_MODE: 'demo-no-auth' };
    expect(() => createRealProvider(env, fetcher)).toThrow(expect.objectContaining({ diagnostic: 'PROVIDER_NOT_APPROVED' }));
    const provider = createProvider(env, fetcher);
    expect(provider.source).toBe('UNCONFIGURED');
    await expect(provider.home()).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['test', 'development'])('keeps the explicit public demo available in %s without Authorization', async NODE_ENV => {
    const fetcher = jest.fn(async (_url: URL, options: RequestInit) => {
      expect(new Headers(options.headers).has('Authorization')).toBe(false);
      return emptyPage();
    });
    const provider = createRealProvider({ ...config, NODE_ENV, PRODUCTOS_AUTH_MODE: 'demo-no-auth' }, fetcher);
    expect((await provider.search(query())).sort).toBeNull();
  });
  it('keeps service-token mode authenticated in production', async () => {
    const provider = createRealProvider({ ...config, NODE_ENV: 'production' }, async (_url, options) => {
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer synthetic-token');
      return emptyPage();
    });
    expect((await provider.search(query())).sort).toBeNull();
  });
  it.each(['NAME_ASC', 'NAME_DESC', undefined])('returns explicit sort metadata %s in REAL and MOCK', async sort => {
    const provider = createRealProvider(config, async url => {
      expect(url.searchParams.get('orden')).toBe(sort ? sort.replace('NAME_', 'NOMBRE_') : null);
      return emptyPage();
    });
    const input = query(sort ? 'sort=' + sort : '');
    expect((await provider.search(input)).sort).toBe(sort ?? null);
    expect((await createMockProvider().search(input)).sort).toBe(sort ?? null);
  });
  it('exposes a safe timeout code distinct from upstream 503 without changing HTTP status', async () => {
    const provider = createRealProvider(config, async () => { throw new DOMException('private timeout detail', 'TimeoutError'); });
    let caught: CatalogError | undefined;
    try { await provider.search(query()); } catch (error) { caught = error as CatalogError; }
    expect(caught).toMatchObject({ code: 'CATALOG_TIMEOUT', status: 503, diagnostic: 'PROVIDER_TIMEOUT' });
    const response = problem(caught!, 'review-correlation');
    expect(response).toMatchObject({ status: 503, code: 'CATALOG_TIMEOUT', requestId: 'review-correlation' });
    expect(JSON.stringify(response)).not.toContain('private timeout detail');
    const unavailable = createRealProvider(config, async () => new Response('private provider body', { status: 503 }));
    await expect(unavailable.search(query())).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503 });
  });
  it.each(['q=polo', 'q=', 'page=0', 'categoryIds=cat', 'unknown=value'])('rejects home query %s before its provider', value => {
    const home = jest.fn(createMockProvider().home);
    const service = new CatalogService({ ...createMockProvider(), home });
    expect(() => service.home(new URLSearchParams(value), 'review-id')).toThrow(expect.objectContaining({ code: 'INVALID_PARAMETERS', status: 400 }));
    expect(home).not.toHaveBeenCalled();
  });
  it.each(['categoryIds=a,b', 'brandIds=a,b', 'categoryIds=a&categoryIds=b', 'brandIds=a&brandIds=b'])('keeps one ID per dimension: %s', value => {
    expect(() => query(value)).toThrow();
  });
});
