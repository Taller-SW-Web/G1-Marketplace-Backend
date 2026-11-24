import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
test.each(['', 'PRICE_ASC', 'NAME_ASC,NAME_DESC', 'name_asc'])('invalid explicit sort %s never reaches the provider', sort => {
  expect(() => parse('sort=' + encodeURIComponent(sort))).toThrow(expect.objectContaining({ code: 'INVALID_SORT' }));
});
test('absent sort remains distinct from empty or unsupported sort', () => {
  expect(parse('').sort).toBeUndefined();
  expect(parse('sort=NAME_DESC').sort).toBe('NAME_DESC');
});
