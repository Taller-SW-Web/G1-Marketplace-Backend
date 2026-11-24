import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
import { CatalogService } from './catalog.service';
test.each(['page=1000001', 'page=9007199254740992', 'pageSize=4&pageSize=48', 'page=0&page=1'])('invalid pagination %s is rejected before provider I/O', query => {
  const search = jest.fn();
  const service = new CatalogService({ source: 'MOCK', home: jest.fn(), search });
  expect(() => service.search(new URLSearchParams(query), 'test')).toThrow();
  expect(search).not.toHaveBeenCalled();
});
test('a valid page beyond the last one is empty and preserves the requested index', async () => {
  const provider = createRealProvider(env, async () => Response.json({ items: [], pagina: 1000001, tamanio: 48, total: 9 }));
  expect(await provider.search(parse('page=1000000&pageSize=48'))).toEqual({ sort: null, data: [], page: { number: 1000000, size: 48, totalElements: 9, totalPages: 1 } });
});
