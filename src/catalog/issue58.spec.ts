import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
test.each(['sort=__proto__', 'sort=NAME_ASC&sort=NAME_DESC', 'sort=NOMBRE_ASC', 'sort=NAME_ASC%26estado%3DINACTIVO'])('unpublished ordering %s is rejected', query => {
  expect(() => parse(query)).toThrow();
});
test('ordered upstream failures never become locally sorted partial success', async () => {
  const provider = createRealProvider(env, async () => new Response('{}', { status: 429 }));
  await expect(provider.search(parse('q=polo&sort=NAME_ASC'))).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503 });
});
