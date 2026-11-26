import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { parseQuery } from './query';
import type { CatalogEnvironment } from './types';
const env: CatalogEnvironment = { CATALOG_SOURCE: 'real', NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-contract-fixture', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA };
const parse = (query: string) => parseQuery(new URLSearchParams(query));
test('search delegates normalized Unicode query through URL encoding and disables upstream caching', async () => {
  const fetchImpl = jest.fn(async () => Response.json({ items: [], pagina: 1, tamanio: 24, total: 0 }));
  const provider = createRealProvider(env, fetchImpl);
  await provider.search(parse('q=' + encodeURIComponent('  polo   niños & deporte  ')));
  const [url, options] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.searchParams.get('q')).toBe('polo niños & deporte');
  expect(url.searchParams.size).toBe(4);
  expect(options.cache).toBe('no-store');
  expect(options.redirect).toBe('error');
});
