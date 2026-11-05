import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
import { projectProduct } from './provider';
test.each(['https://images.example.evil/p.jpg', 'https://user:pass@images.example/p.jpg', 'http://images.example/p.jpg', 'javascript:alert(1)'])('rejects media host bypass %s', url => {
  expect(() => projectProduct({ product_id: 'p1', slug: 'polo', name: 'Polo', categoria_id: 'running', marca_id: 'brand', images: [url] }, new Set(['images.example']))).toThrow(expect.objectContaining({ status: 503 }));
});
test('inactive products cannot enter public cards even with valid media', () => {
  expect(() => projectProduct({ product_id: 'p1', slug: 'polo', name: 'Polo', categoria_id: 'running', marca_id: 'brand', status: 'INACTIVO' }, new Set())).toThrow(expect.objectContaining({ diagnostic: 'INELIGIBLE_PRODUCT' }));
});
