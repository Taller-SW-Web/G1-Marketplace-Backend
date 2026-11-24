import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
import { CatalogService } from './catalog.service';
test.each(['pageSize=-1', 'pageSize=999999999999999999999', 'pageSize=1e3', 'page=Infinity', 'pageSize=0', 'page=1.5'])('abusive pagination %s never amplifies upstream calls', query => {
  const search = jest.fn();
  const service = new CatalogService({ source: 'MOCK', home: jest.fn(), search });
  expect(() => service.search(new URLSearchParams(query), 'security-fixture')).toThrow(expect.objectContaining({ code: 'INVALID_PAGE' }));
  expect(search).not.toHaveBeenCalled();
});
