import { createProvider, createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { configuredFeaturedIds, resolveFeatured } from './featured';
import type { CatalogEnvironment, ProductCardDTO } from './types';

const ids = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true',
  PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-test-token',
  PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
  CATALOG_FEATURED_ENABLED: 'true', CATALOG_FEATURED_APPROVED: 'true', CATALOG_FEATURED_IDS: ids.slice(0, 2).join(',') };
const raw = (id: string) => ({ product_id: id, name: 'Owner name', slug: 'owner-product', categoria_id: 'cat',
  marca_id: 'brand', images: [], private_field: 'not-public', variants: [] });

it('REAL has no curated reads until enabled and approved; MOCK can demonstrate synthetic IDs', async () => {
  expect(configuredFeaturedIds({ ...env, CATALOG_FEATURED_APPROVED: 'false' }, 'REAL')).toEqual([]);
  expect(configuredFeaturedIds({ ...env, CATALOG_FEATURED_ENABLED: 'false' }, 'REAL')).toEqual([]);
  const fetcher = jest.fn(async () => Response.json({ categories: [] }));
  await createRealProvider({ ...env, CATALOG_FEATURED_APPROVED: 'false' }, fetcher).home();
  expect(fetcher).toHaveBeenCalledTimes(1);
  const mock = createProvider({ CATALOG_SOURCE: 'mock', NODE_ENV: 'test', CATALOG_FEATURED_ENABLED: 'true',
    CATALOG_FEATURED_IDS: 'mock-product-3,mock-product-1' });
  expect((await mock.home()).featuredProducts.map(p => p.productId)).toEqual(['mock-product-3', 'mock-product-1']);
});

it.each([ids[0]+','+ids[0], ids.concat(ids[0]).join(','), '../admin', ids[0]+',', 'x'.repeat(2049)])
('rejects unsafe, duplicate, oversized or ambiguous editorial configuration', value => {
  expect(() => configuredFeaturedIds({ ...env, CATALOG_FEATURED_IDS: value }, 'REAL')).toThrow();
});

it('preserves editorial order, projects current owner fields and shares the home budget', async () => {
  const signals: AbortSignal[] = [];
  const result = await createRealProvider(env, async (url, options) => {
    signals.push(options.signal!);
    expect(options.cache).toBe('no-store');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer synthetic-test-token');
    if (url.pathname.endsWith('/categorias')) return Response.json({ categories: [] });
    expect(url.searchParams.get('canal')).toBe('MARKETPLACE');
    return Response.json(raw(url.pathname.split('/').pop()!));
  }).home();
  expect(result.featuredProducts.map(p => p.productId)).toEqual(ids.slice(0, 2));
  expect(result.featuredProducts[0]).toEqual({ productId: ids[0], name: 'Owner name', slug: 'owner-product',
    categoryId: 'cat', brandId: 'brand', image: null });
  expect(new Set(signals).size).toBe(1);
});

it('omits confirmed missing products and known ineligible products without fabricating cards', async () => {
  const result = await createRealProvider(env, async url => url.pathname.endsWith('/categorias')
    ? Response.json({ categories: [] })
    : url.pathname.endsWith(ids[0]) ? Response.json({ code: 'PRODUCTO_NO_ENCONTRADO' }, { status: 404 })
    : Response.json({ ...raw(ids[1]), status: 'INACTIVO' })).home();
  expect(result.featuredProducts).toEqual([]);
});

it('omits a configured identified product with an unpublishable slug', async () => {
  const result = await createRealProvider(env, async url => Response.json(url.pathname.endsWith('/categorias')
    ? { categories: [] } : { ...raw(url.pathname.split('/').pop()!), slug: '../private' })).home();
  expect(result.featuredProducts).toEqual([]);
});

it.each([503, 401, 403, 429, 404])('technical HTTP %i is not an empty editorial success', async status => {
  const provider = createRealProvider(env, async url => url.pathname.endsWith('/categorias')
    ? Response.json({ categories: [] }) : Response.json({ code: 'OTHER_ERROR' }, { status }));
  await expect(provider.home()).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
});

it('rejects a different identity returned by a product lookup', async () => {
  const provider = createRealProvider(env, async url => Response.json(url.pathname.endsWith('/categorias')
    ? { categories: [] } : raw(ids[7])));
  await expect(provider.home()).rejects.toMatchObject({ diagnostic: 'FEATURED_ID_MISMATCH' });
});

it('bounds simultaneous lookups to three while preserving editorial order', async () => {
  let active = 0, max = 0;
  const cards = await resolveFeatured(ids, async id => {
    active++; max = Math.max(max, active);
    await new Promise<void>(resolve => setImmediate(resolve));
    active--;
    return { productId: id } as ProductCardDTO;
  });
  expect(max).toBe(3);
  expect(cards.map(p => p.productId)).toEqual(ids);
});
