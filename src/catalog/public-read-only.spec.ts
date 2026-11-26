import { assertPublicCatalogRead } from './public-read-only';
import { createProvider, createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';

const id = 'a0000000-0000-4000-8000-000000000001';
const config = {
  NODE_ENV: 'production', CATALOG_SOURCE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
  PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_AUTH_MODE: 'public-read-only',
  PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA, PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION,
};
const emptyPage = () => Response.json({ items: [], total: 0, pagina: 1, tamanio: 24 });

describe('public-read-only closed transport boundary', () => {
  it.each([
    '/api/v1/categorias', '/api/v1/marcas', '/api/v1/productos?canal=MARKETPLACE',
    `/api/v1/productos/${id}?canal=MARKETPLACE`,
    '/api/v1/productos?canal=MARKETPLACE&pagina=1&tamanio=24&q=polo%20azul&categoriaId=cat&marcaId=brand&precioMin=0&precioMax=100&orden=NOMBRE_ASC',
  ])('permits existing catalog GET %s', path => {
    expect(() => assertPublicCatalogRead('GET', path)).not.toThrow();
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'get'])('rejects method %s', method => {
    expect(() => assertPublicCatalogRead(method, '/api/v1/categorias')).toThrow();
  });
  it.each([
    '/api/v1/admin', '/api/v1/precios', '/api/v1/stock', '/api/v1/promociones',
    `/api/v1/productos/${id}/reservar?canal=MARKETPLACE`,
    '/api/v1/productos/por-slug/polo-azul?canal=MARKETPLACE',
    '/api/v1/productos', '/api/v1/productos?canal=TIENDA',
    '/api/v1/productos?canal=MARKETPLACE&canal=MARKETPLACE',
    '/api/v1/productos?canal=MARKETPLACE&includeInactive=true',
    '/api/v1/productos?canal=MARKETPLACE&q=a&q=b',
    `/api/v1/productos/${id}?canal=MARKETPLACE&precioMin=1`,
    '/api/v1/categorias?canal=MARKETPLACE', '/api/v1/marcas?admin=true',
    '/api/v1/productos/../categorias', '/api/v1/%63ategorias',
    '/api/v1/productos/%2f?canal=MARKETPLACE', '/api/v1/categorias#fragment',
    'https://other.example/api/v1/categorias', '//other.example/api/v1/categorias',
  ])('rejects unapproved target %s', path => {
    expect(() => assertPublicCatalogRead('GET', path)).toThrow(expect.objectContaining({
      code: 'CATALOG_UNAVAILABLE', status: 503, diagnostic: 'PUBLIC_READ_NOT_ALLOWED',
    }));
  });
});

describe('production public catalog configuration', () => {
  it.each([undefined, 'synthetic-stale-token'])('reads all existing resources without credentials with token=%s', async token => {
    const fetcher = jest.fn(async (url: URL, options: RequestInit) => {
      expect(url.origin).toBe(config.PRODUCTOS_BASE_URL);
      expect(options).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' });
      const headers = new Headers(options.headers);
      expect(headers.has('Authorization')).toBe(false);
      expect(headers.has('Cookie')).toBe(false);
      expect(headers.get('X-Correlation-Id')).toBe(id);
      if (url.pathname === '/api/v1/categorias') return Response.json({ categories: [] });
      if (url.pathname === '/api/v1/marcas') return Response.json({ brands: [] });
      expect(url.searchParams.get('canal')).toBe('MARKETPLACE');
      if (url.pathname === `/api/v1/productos/${id}`) return Response.json({
        product_id: id, name: 'Polo', categoria_id: 'cat', marca_id: 'brand', slug: 'polo', status: 'ACTIVO',
      });
      return emptyPage();
    });
    const provider = createRealProvider({ ...config, PRODUCTOS_SERVICE_TOKEN: token,
      G7_TOKEN_URL: 'https://g7.example/api/v1/auth/token', PRODUCTOS_CLIENT_SECRET: 'synthetic-unused-secret',
      CATALOG_FEATURED_ENABLED: 'true', CATALOG_FEATURED_APPROVED: 'true', CATALOG_FEATURED_IDS: id }, fetcher);
    expect(provider.source).toBe('REAL');
    expect((await provider.home(id)).featuredProducts[0].productId).toBe(id);
    expect(await provider.filters!(id)).toEqual({ categories: [], brands: [] });
    expect((await provider.search(parseQuery(new URLSearchParams()), id)).data).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it.each([
    { PRODUCTOS_AUTH_MODE: undefined }, { PRODUCTOS_AUTH_MODE: '' },
    { PRODUCTOS_AUTH_MODE: 'anonymous' }, { PRODUCTOS_AUTH_MODE: 'demo-no-auth' },
    { PRODUCTOS_BASE_URL: 'http://provider.example' }, { PRODUCTOS_BASE_URL: 'https://provider.example/api/v1' },
    { PRODUCTOS_CONTRACT_SHA: 'wrong' }, { PRODUCTOS_CONTRACT_VERSION: 'wrong' },
    { CATALOG_INTEGRATION_APPROVED: 'false' },
  ])('fails closed before transport for invalid configuration %j', async override => {
    const fetcher = jest.fn(async () => emptyPage());
    const env = { ...config, ...override };
    expect(() => createRealProvider(env, fetcher)).toThrow();
    const provider = createProvider(env, fetcher);
    expect(provider.source).toBe('UNCONFIGURED');
    await expect(provider.home()).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps default service-token behavior and production mock prohibition', async () => {
    const fetcher = jest.fn(async (_url: URL, options: RequestInit) => {
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer synthetic-service-token');
      return emptyPage();
    });
    await createRealProvider({ ...config, PRODUCTOS_AUTH_MODE: undefined,
      PRODUCTOS_SERVICE_TOKEN: 'synthetic-service-token' }, fetcher).search(parseQuery(new URLSearchParams()));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(() => createProvider({ ...config, CATALOG_SOURCE: 'mock' }, fetcher)).toThrow();
  });

  it.each(['public-read-only', 'client-credentials', 'service-token'])
  ('keeps %s isolated from the other authentication modes after integrating develop', async authMode => {
    const tokens: string[] = [];
    const reads: RequestInit[] = [];
    const provider = createRealProvider({ ...config, PRODUCTOS_AUTH_MODE: authMode,
      PRODUCTOS_SERVICE_TOKEN: 'synthetic-static-token',
      G7_TOKEN_URL: 'https://g7.example/api/v1/auth/token', PRODUCTOS_CLIENT_SECRET: 'synthetic-client-secret',
    }, async (url, options) => {
      if (url.origin === 'https://g7.example') {
        expect(options.method).toBe('POST');
        expect(new Headers(options.headers).has('Authorization')).toBe(false);
        expect(new URLSearchParams(String(options.body)).get('scope')).toBe('catalogo:leer');
        tokens.push(url.href);
        return Response.json({ accessToken: 'synthetic-issued-token', tokenType: 'Bearer',
          expiresIn: 3600, scopes: ['catalogo:leer'] });
      }
      expect(url.origin).toBe(config.PRODUCTOS_BASE_URL);
      expect(options).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' });
      const headers = new Headers(options.headers);
      expect(headers.has('Cookie')).toBe(false);
      expect(headers.get('Authorization')).toBe(authMode === 'public-read-only' ? null
        : authMode === 'service-token' ? 'Bearer synthetic-static-token' : 'Bearer synthetic-issued-token');
      reads.push(options);
      if (url.pathname === '/api/v1/categorias') return Response.json({ categories: [] });
      if (url.pathname === '/api/v1/marcas') return Response.json({ brands: [] });
      return emptyPage();
    });
    await Promise.all([provider.home(), provider.filters!(), provider.search(parseQuery(new URLSearchParams()))]);
    expect(reads).toHaveLength(4);
    expect(tokens).toHaveLength(authMode === 'client-credentials' ? 1 : 0);
  });

  it.each([401, 403, 503])('does not retry with a token or return mock data on upstream %s', async status => {
    const fetcher = jest.fn(async (_url: URL, _options: RequestInit) => new Response('private upstream body', { status }));
    const provider = createRealProvider({ ...config, PRODUCTOS_SERVICE_TOKEN: 'synthetic-stale-token' }, fetcher);
    await expect(provider.search(parseQuery(new URLSearchParams()))).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE', status: 503, diagnostic: `PROVIDER_HTTP_${status}`,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has('Authorization')).toBe(false);
  });

  it('does not follow a rejected redirect or retry after a transport failure', async () => {
    const fetcher = jest.fn(async (_url: URL, options: RequestInit) => {
      expect(options.redirect).toBe('error');
      throw new TypeError('redirect rejected');
    });
    await expect(createRealProvider(config, fetcher).search(parseQuery(new URLSearchParams())))
      .rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
