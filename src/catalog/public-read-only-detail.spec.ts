import { createG6Client, CONTRACT_SHA, CONTRACT_VERSION } from './g6-client';
import { assertPublicCatalogRead } from './public-read-only';
import { createProvider, createRealProvider } from './provider';
import { projectProductDetail, realProductDetail } from './product-detail.real';
import { ProductDetailService } from './product-detail.service';
import { validateEnvironment } from '../config/environment';

const env = { NODE_ENV: 'production', CATALOG_SOURCE: 'real', BFF_MODE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
  PRODUCTOS_AUTH_MODE: 'public-read-only', PRODUCTOS_BASE_URL: 'https://g6.example',
  PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
  PRODUCTOS_MEDIA_HOSTS: 'images.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-stale-marker' };
const product = () => ({ product_id: 'p-real', slug: 'polo-real', name: 'Polo real', marca_id: 'brand',
  marca: { marca_id: 'brand', name: 'Marca' }, description: 'Descripcion real',
  images: ['https://images.example/product.png'], attributes: [{ nombre: 'Color', valor: 'Azul' },
    { nombre: 'Talla sin resolver', valor_id: 'id-only', valor: { valor_id: 'id-only' } }],
  sku_base: 'private-to-F011', precio_regular: 12, stock: 7, variants: [] });

describe('G6 public-read-only consumer boundary', () => {
  it('requires opt-in; the default still requires a service token', () => {
    const { PRODUCTOS_AUTH_MODE: _mode, PRODUCTOS_SERVICE_TOKEN: _token, ...defaultEnv } = env;
    expect(createProvider(defaultEnv).source).toBe('UNCONFIGURED');
    expect(() => createProvider({ ...env, CATALOG_SOURCE: 'mock' })).toThrow();
    expect(() => createProvider({ ...env, CATALOG_SOURCE: undefined })).toThrow();
    expect(createProvider({ ...env, PRODUCTOS_SERVICE_TOKEN: '' }).source).toBe('REAL');
    expect(createProvider({ ...env, CATALOG_INTEGRATION_APPROVED: 'false' }).source).toBe('UNCONFIGURED');
  });
  it.each(['BFF_MODE', 'CATALOG_SOURCE', 'CATALOG_INTEGRATION_APPROVED', 'PRODUCTOS_CONTRACT_SHA', 'PRODUCTOS_CONTRACT_VERSION'])
    ('fails closed with missing %s before transport', key => {
      const fetcher = jest.fn();
      const config: Record<string, string | undefined> = { ...env, [key]: undefined };
      expect(() => createG6Client(config, fetcher)).toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    });
  it('refuses public mode with a MOCK detail, including at server startup', () => {
    expect(() => validateEnvironment({ ...env, BFF_MODE: 'mock', DATABASE_URL: 'postgresql://localhost/test' })).toThrow();
    expect(() => createG6Client({ ...env, BFF_MODE: 'mock' })).toThrow();
  });
  it.each(['/api/v1/categorias', '/api/v1/marcas', '/api/v1/productos?canal=MARKETPLACE&pagina=1&tamanio=4&q=Nike',
    '/api/v1/productos/12345678-1234-4234-8234-123456789abc?canal=MARKETPLACE',
    '/api/v1/productos/por-slug/polo-real?canal=MARKETPLACE'])('allows only agreed GET %s without Authorization or cookies', async path => {
    const fetcher = jest.fn(async (_url: URL, options: RequestInit) => {
      expect(options.method).toBe('GET');
      expect(options.redirect).toBe('error');
      expect(options.cache).toBe('no-store');
      expect(new Headers(options.headers).has('Authorization')).toBe(false);
      expect(new Headers(options.headers).has('Cookie')).toBe(false);
      expect(new Headers(options.headers).get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
      return Response.json({ ok: true });
    });
    await createG6Client(env, fetcher).get(path, 'opaque-browser-id');
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) expect(() => assertPublicCatalogRead(method, path, { allowDetailBySlug: true })).toThrow();
  });
  it.each(['/api/v1/marcas/administracion', '/api/v1/categorias?admin=true', '/api/v1/precios/skus/SKU?canal=MARKETPLACE',
    '/api/v1/inventario/disponibilidad/comercial?canal=MARKETPLACE', '/api/v1/recomendaciones?canal=MARKETPLACE',
    '/api/v1/productos?canal=RETAIL', '/api/v1/productos?canal=MARKETPLACE&admin=true',
    '/api/v1/productos?canal=MARKETPLACE&canal=RETAIL', '/api/v1/productos/por-slug/polo/extra?canal=MARKETPLACE',
    '/api/v1/productos/por-slug/a%2Fb?canal=MARKETPLACE', '//other.example/api/v1/marcas'])
    ('blocks unapproved URL before transport: %s', async path => {
      const fetcher = jest.fn();
      await expect(createG6Client(env, fetcher).get(path)).rejects.toMatchObject({ diagnostic: 'PUBLIC_READ_ONLY_ROUTE_NOT_ALLOWED' });
      expect(fetcher).not.toHaveBeenCalled();
    });
  it('keeps service-token Authorization and the production demo-no-auth restriction', async () => {
    const fetcher = jest.fn(async (_url: URL, options: RequestInit) => {
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer synthetic-stale-marker');
      return Response.json({});
    });
    await createG6Client({ ...env, PRODUCTOS_AUTH_MODE: 'service-token' }, fetcher).get('/api/v1/marcas');
    expect(() => createG6Client({ ...env, PRODUCTOS_AUTH_MODE: 'demo-no-auth' })).toThrow();
  });
  it('connects both real masters and projects only active brands', async () => {
    const provider = createRealProvider(env, async url => Response.json(url.pathname.endsWith('/categorias')
      ? { categories: [{ categoria_id: 'cat', name: 'Categoria', status: 'ACTIVA' }] }
      : { brands: [{ marca_id: 'b1', name: 'Marca real', status: 'ACTIVA', secret: 'not-public' },
        { marca_id: 'b2', name: 'Oculta', status: 'INACTIVA' }] }));
    expect(await provider.filters!()).toEqual({ categories: [{ categoryId: 'cat', name: 'Categoria' }],
      brands: [{ brandId: 'b1', name: 'Marca real' }] });
  });
  it.each([401, 403, 503])('does not retry with a token or fixtures after upstream %i', async status => {
    const fetcher = jest.fn(async () => Response.json({}, { status }));
    await expect(createRealProvider(env, fetcher).search({ q: '', page: 0, pageSize: 4 })).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('REAL product detail F-011', () => {
  it('projects brand/media/readable attributes without internal fields or invented ID values', () => {
    const result = projectProductDetail(product(), 'polo-real', new Set(['images.example']));
    expect(result.meta.source).toBe('REAL');
    expect(result.data.technicalSpecifications).toEqual([{ name: 'Color', value: 'Azul', displayOrder: 0 }]);
    expect(result.data.brand).toEqual({ brandId: 'brand', name: 'Marca' });
    expect(Object.keys(result.data).sort()).toEqual(['brand', 'description', 'media', 'name', 'productId', 'slug', 'technicalSpecifications']);
  });
  it.each([
    { slug: 'wrong-product' }, { marca: { marca_id: 'other', name: 'Otra' } }, { images: [] },
    { images: ['http://images.example/photo'] }, { images: ['https://other.example/photo'] },
    { images: ['https://images.example@other.example/photo'] }, { attributes: 'invalid' },
    { attributes: [{ nombre: 'Color' }] }, { status: 'UNKNOWN' },
  ])('rejects malformed or unsafe projection %j', mutation => {
    expect(() => projectProductDetail({ ...product(), ...mutation }, 'polo-real', new Set(['images.example'])))
      .toThrow(expect.objectContaining({ status: 502 }));
  });
  it('loads the actual slug with correlation and no Authorization', async () => {
    const id = 'a891739e-640e-411f-a1c9-ef704593bbf2';
    const fetcher = jest.fn(async (url: URL, options: RequestInit) => {
      expect(url.pathname).toBe('/api/v1/productos/por-slug/polo-real');
      expect(url.search).toBe('?canal=MARKETPLACE');
      expect(new Headers(options.headers).get('X-Correlation-Id')).toBe(id);
      expect(new Headers(options.headers).has('Authorization')).toBe(false);
      return Response.json(product());
    });
    expect((await realProductDetail('polo-real', env, fetcher, id)).data.productId).toBe('p-real');
  });
  it('does not return a known fixture when REAL is selected but misconfigured', async () => {
    const before = { ...process.env };
    try {
      Object.assign(process.env, env, { BFF_MODE: 'mock' });
      await expect(new ProductDetailService().getBySlug('zapatillas-running-aero-x')).rejects.toMatchObject({ status: 503 });
    } finally { process.env = before; }
  });
  it.each([
    [404, { code: 'PRODUCTO_NO_ENCONTRADO' }, 404], [404, { code: 'OTHER' }, 503],
    [401, {}, 503], [403, {}, 503], [503, {}, 503], [200, {}, 502],
  ])('preserves mapped upstream failure %# without fallback', async (status, body, expected) => {
    await expect(realProductDetail('polo-real', env, async () => Response.json(body, { status })))
      .rejects.toMatchObject({ status: expected });
  });
  it('distinguishes timeout 504, invalid JSON 502 and transport failure 503', async () => {
    await expect(realProductDetail('polo-real', env, async () => { throw new DOMException('', 'TimeoutError'); })).rejects.toMatchObject({ status: 504 });
    await expect(realProductDetail('polo-real', env, async () => new Response('not-json'))).rejects.toMatchObject({ status: 502 });
    await expect(realProductDetail('polo-real', env, async () => { throw new TypeError('network'); })).rejects.toMatchObject({ status: 503 });
  });
});
