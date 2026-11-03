import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
test.each(['../admin', 'a,b', 'a'.repeat(121), 'brand id'])('filter masters reject an unusable brand identifier: %s', async id => {
  const provider = createRealProvider(env, async url => Response.json(url.pathname.endsWith('/categorias') ? { categories: [] } : { brands: [{ marca_id: id, name: 'Brand', status: 'ACTIVA' }] }));
  await expect(provider.filters!()).rejects.toMatchObject({ status: 503, diagnostic: 'INVALID_BRAND' });
});
test('active brand filtering does not publish inactive master data', async () => {
  const provider = createRealProvider(env, async url => Response.json(url.pathname.endsWith('/categorias') ? { categories: [] } : { brands: [{ marca_id: 'active', name: 'Public', status: 'ACTIVA' }, { marca_id: 'hidden', name: 'Private', status: 'INACTIVA' }] }));
  expect(await provider.filters!()).toEqual({ categories: [], brands: [{ brandId: 'active', name: 'Public' }] });
});
