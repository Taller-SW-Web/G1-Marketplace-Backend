import { CatalogService } from './catalog.service';
import { CatalogError, problem } from './errors';
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

test('overlong search query is rejected before provider I/O', () => {
  const search = jest.fn();
  const service = new CatalogService({ source: 'MOCK', home: jest.fn(), search });
  const query = new URLSearchParams(`q=${'x'.repeat(121)}`);

  expect(() => service.search(query, 'qa-f007'))
    .toThrow(expect.objectContaining({ code: 'INVALID_SEARCH_QUERY', status: 400 }));
  expect(search).not.toHaveBeenCalled();
});

test('encoded filter-shaped text stays inside one q provider parameter', async () => {
  let seen: URL | undefined;
  const provider = createRealProvider(env, async url => {
    seen = url;
    return Response.json({ items: [], total: 0, pagina: 1, tamanio: 24 });
  });
  const searchText = 'polo&estado=INACTIVO';

  await provider.search(parse(`q=${encodeURIComponent(searchText)}`));

  expect(seen?.pathname).toBe('/api/v1/productos');
  expect(seen?.searchParams.getAll('q')).toEqual([searchText]);
  expect(seen?.searchParams.has('estado')).toBe(false);
});

test('upstream 403 never returns provider error text or an empty success', async () => {
  const provider = createRealProvider(env, async () => new Response('private upstream token detail', { status: 403 }));
  let caught: CatalogError | undefined;
  try {
    await provider.search(parse('q=polo'));
  } catch (error) {
    caught = error as CatalogError;
  }

  expect(caught).toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503, diagnostic: 'PROVIDER_HTTP_403' });
  expect(String(caught)).not.toContain('private upstream token detail');
  const response = problem(caught!, 'qa-f007-safe');
  expect(response).toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503, requestId: 'qa-f007-safe' });
  expect(JSON.stringify(response)).not.toContain('private upstream token detail');
});
