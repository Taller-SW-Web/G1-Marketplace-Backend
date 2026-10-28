import { parseQuery } from './query';
import { createRealProvider, CONTRACT_SHA } from './provider';
import { createMockProvider } from './fixtures';
import { CatalogService } from './catalog.service';

const parse = (query: string) => parseQuery(new URLSearchParams(query));
const config = {
  CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://provider.example',
  PRODUCTOS_SERVICE_TOKEN: 'synthetic-token', PRODUCTOS_CONTRACT_VERSION: '0.6.0-rc.1',
  PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
};
const product = { product_id: 'p1', slug: 'polo', name: 'Polo', categoria_id: 'cat', marca_id: 'brand' };

describe('H4 catalog filters, ordering and paging', () => {
  it.each(['minPrice=-1', 'maxPrice=Infinity', 'minPrice=1e2', 'minPrice=', 'minPrice=1.001',
    'minPrice=20&maxPrice=10', 'maxPrice=99999999999999999'])('rejects invalid PEN range %s', query => {
    expect(() => parse(query)).toThrow(expect.objectContaining({ code: 'INVALID_PRICE_RANGE' }));
  });
  it.each(['brandIds=a,b', 'brandIds=', 'categoryIds=', 'brandIds=../admin', 'minPrice=1&minPrice=2'])
    ('rejects ambiguous or unsafe filters %s', query => expect(() => parse(query)).toThrow());

  it('delegates combined criteria without local page filtering and preserves zero prices', async () => {
    const fetcher = jest.fn(async () => Response.json({ items: [product], total: 3, pagina: 2, tamanio: 2 }));
    const provider = createRealProvider(config, fetcher);
    const result = await provider.search(parse('q=polo&categoryIds=cat&brandIds=brand&minPrice=0&maxPrice=99.90&sort=NAME_ASC&page=1&pageSize=2'));
    const url = (fetcher.mock.calls as unknown as [URL][])[0][0];
    expect(Object.fromEntries(url.searchParams)).toEqual({ canal: 'MARKETPLACE', pagina: '2', tamanio: '2',
      q: 'polo', categoriaId: 'cat', marcaId: 'brand', precioMin: '0', precioMax: '99.9', orden: 'NOMBRE_ASC' });
    expect(result.page).toEqual({ number: 1, size: 2, totalElements: 3, totalPages: 2 });
  });

  it('projects active masters only, excludes private fields and correlates both requests', async () => {
    const provider = createRealProvider(config, async (url, options) => {
      expect(new Headers(options.headers).get('X-Correlation-Id')).toBe('h4-correlation');
      return Response.json(url.pathname.endsWith('/categorias') ? { categories: [
        { categoria_id: 'cat', name: 'Ropa', status: 'ACTIVA', private: true },
        { categoria_id: 'hidden', name: 'Oculta', status: 'INACTIVA' },
      ] } : { brands: [
        { marca_id: 'brand', name: 'Marca', status: 'ACTIVA', country_code: 'PE' },
        { marca_id: 'hidden', name: 'Oculta', status: 'INACTIVA' },
      ] });
    });
    expect(await provider.filters!('h4-correlation')).toEqual({
      categories: [{ categoryId: 'cat', name: 'Ropa' }], brands: [{ brandId: 'brand', name: 'Marca' }],
    });
  });

  it('does not turn a failed masters request into an empty success', async () => {
    const provider = createRealProvider(config, async url => url.pathname.endsWith('/marcas')
      ? new Response('private upstream error', { status: 503 }) : Response.json({ categories: [] }));
    await expect(provider.filters!()).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503 });
    expect(await provider.home()).toEqual({ categories: [], featuredProducts: [] });
  });
  it('maps an invalid upstream master to a safe input error without leaking its body', async () => {
    const provider = createRealProvider(config, async () => Response.json({ code: 'MARCA_INVALIDA', secret: 'hidden' }, { status: 422 }));
    await expect(provider.search(parse('brandIds=bad'))).rejects.toMatchObject({ code: 'INVALID_FILTER', status: 400 });
  });
  it.each([
    { items: [product], total: 0, pagina: 1, tamanio: 24 },
    { items: [product, product], total: 2, pagina: 1, tamanio: 24 },
    { items: [], total: 1, pagina: 1, tamanio: 24 },
  ])('rejects inconsistent provider pages instead of certifying incorrect totals', async payload => {
    const provider = createRealProvider(config, async () => Response.json(payload));
    await expect(provider.search(parse(''))).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
  });
  it('keeps ordering global before slicing synthetic pages and supports combined filters', async () => {
    const mock = createMockProvider();
    const query = parse('q=running&brandIds=mock-brand&minPrice=0&maxPrice=320&sort=NAME_DESC&pageSize=4');
    const pages = await Promise.all([0, 1, 2, 3].map(page => mock.search({ ...query, page })));
    const names = pages.flatMap(page => page.data.map(item => item.name));
    expect(new Set(names).size).toBe(16);
    expect(names).toEqual([...names].sort((a, b) => -a.localeCompare(b, 'es')));
    expect((await mock.search(parse('minPrice=10&maxPrice=20'))).data).toHaveLength(2);
    expect((await mock.search(parse('page=999'))).data).toEqual([]);
    await expect(mock.search(parse('brandIds=unknown'))).rejects.toMatchObject({ code: 'INVALID_FILTER' });
  });
  it('validates before calling the provider and fails closed when masters are unavailable', async () => {
    const mock = createMockProvider();
    const search = jest.fn(mock.search);
    const service = new CatalogService({ ...mock, search, filters: undefined });
    expect(() => service.search(new URLSearchParams('minPrice=20&maxPrice=10'), 'id')).toThrow();
    expect(search).not.toHaveBeenCalled();
    expect(() => service.filters(new URLSearchParams(), 'id')).toThrow(expect.objectContaining({ status: 503 }));
  });
});
