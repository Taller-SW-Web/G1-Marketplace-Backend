import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
import { CatalogService } from './catalog.service';
test.each(['minPrice=1e2', 'maxPrice=Infinity', 'minPrice=NaN', 'minPrice=0.001', 'minPrice=30&maxPrice=10', 'brandIds=b&brandIds=c', 'categoryIds=c%26estado%3DINACTIVO'])('invalid filters %s never start I/O', query => {
  const search = jest.fn();
  const service = new CatalogService({ source: 'MOCK', home: jest.fn(), search });
  expect(() => service.search(new URLSearchParams(query), 'test')).toThrow();
  expect(search).not.toHaveBeenCalled();
});
