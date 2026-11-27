import { isPublicCatalogRead } from './configure-app';

describe('public catalog compression boundary', () => {
  it.each([
    ['/api/v1/catalog/home', true],
    ['/api/v1/catalog/filters', true],
    ['/api/v1/catalog/products?q=running&pageSize=48', true],
    ['/api/v1/catalog/products', true],
    ['/api/v1/catalog/products/secret-product', false],
    ['/api/v1/catalog/products/secret-product/price?sku=SKU-1', false],
    ['/api/v1/catalog/home/private', false],
    ['/api/v1/catalog/homepage', false],
    ['/api/v1/catalog/products-private?q=running', false],
  ])('allows only exact public catalog routes: %s', (requestUrl, expected) => {
    expect(isPublicCatalogRead('GET', requestUrl)).toBe(expected);
  });

  it('does not compress non-GET requests, even at a public catalog path', () => {
    expect(isPublicCatalogRead('POST', '/api/v1/catalog/home')).toBe(false);
    expect(isPublicCatalogRead('HEAD', '/api/v1/catalog/products')).toBe(false);
  });
});
