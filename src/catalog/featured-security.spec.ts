import { projectProduct, createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
const id = '00000000-0000-4000-8000-000000000001';
const product = { product_id: id, name: 'Public', slug: 'public', categoria_id: 'cat', marca_id: 'brand', images: [] };
it.each(['', false, null, 'UNKNOWN', 'INACTIVO', 'BORRADOR'])('does not publish explicit non-active status %p', status => {
  expect(() => projectProduct({ ...product, status }, new Set())).toThrow();
});
it('public projection excludes management fields and credentials', () => {
  expect(Object.keys(projectProduct({ ...product, status: 'ACTIVO', internal_notes: 'private',
    token: 'not-a-credential', sku_base: 'internal', variants: [{ sku: 'internal' }] }, new Set())).sort())
    .toEqual(['brandId', 'categoryId', 'image', 'name', 'productId', 'slug']);
});
it('a present unapproved image is not silently replaced with a placeholder', async () => {
  const provider = createRealProvider({ NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true',
    PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-test-token',
    PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
    CATALOG_FEATURED_ENABLED: 'true', CATALOG_FEATURED_APPROVED: 'true', CATALOG_FEATURED_IDS: id }, async url =>
      Response.json(url.pathname.endsWith('/categorias') ? { categories: [] } : { ...product, images: ['https://unapproved.example/a.png'] }));
  await expect(provider.home()).rejects.toMatchObject({ diagnostic: 'UNAPPROVED_MEDIA_HOST' });
});
