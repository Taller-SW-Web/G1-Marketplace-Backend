import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
test.each(['CATALOG_INTEGRATION_APPROVED', 'PRODUCTOS_SERVICE_TOKEN', 'PRODUCTOS_CONTRACT_SHA'])('unconfigured %s prevents any upstream request', key => {
  const fetchImpl = jest.fn();
  expect(() => createRealProvider({ ...env, [key]: undefined }, fetchImpl)).toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});
test('upstream 403 never returns provider error text or an empty success', async () => {
  const provider = createRealProvider(env, async () => new Response('private upstream token detail', { status: 403 }));
  await expect(provider.search(parse('q=polo'))).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE', diagnostic: 'PROVIDER_HTTP_403' });
});
