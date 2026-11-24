import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
test.each(['../private', 'a,b', 'x'.repeat(121), 'with space'])('home rejects a category ID that cannot be used by catalog filters: %s', async id => {
  const provider = createRealProvider(env, async () => Response.json({ categories: [{ categoria_id: id, name: 'Running', status: 'ACTIVA' }] }));
  await expect(provider.home()).rejects.toMatchObject({ status: 503, diagnostic: 'INVALID_CATEGORY' });
});
test('home preserves accepted Unicode identifiers without inventing featured products', async () => {
  const provider = createRealProvider(env, async () => Response.json({ categories: [{ categoria_id: 'niños-1', name: 'Niños', status: 'ACTIVA' }] }));
  expect(await provider.home()).toEqual({ categories: [{ categoryId: 'niños-1', name: 'Niños' }], featuredProducts: [] });
});
