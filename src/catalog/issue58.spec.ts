import { CatalogService } from './catalog.service';
import { createMockProvider } from './fixtures';
import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';

const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));

test.each([
  ['sort=__proto__', 'INVALID_SORT'],
  ['sort=NAME_ASC&sort=NAME_DESC', 'INVALID_PARAMETERS'],
  ['sort=NOMBRE_ASC', 'INVALID_SORT'],
  ['sort=NAME_ASC%26estado%3DINACTIVO', 'INVALID_SORT'],
])('rejects unpublished or injection-shaped ordering %s before provider I/O', (query, code) => {
  const provider = createMockProvider();
  const search = jest.spyOn(provider, 'search');
  const service = new CatalogService(provider);

  expect(() => service.search(new URLSearchParams(query), 'qa-issue58'))
    .toThrow(expect.objectContaining({ code, status: 400 }));
  expect(search).not.toHaveBeenCalled();
});

test('ordered upstream failures never become locally sorted partial success', async () => {
  const provider = createRealProvider(env, async () => new Response('{}', { status: 429 }));
  await expect(provider.search(parse('q=polo&sort=NAME_ASC'))).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503 });
});
