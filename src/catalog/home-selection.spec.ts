import { randomIndices, sampleCatalog, selectHomeProducts } from './home-selection';
import type { SalesRanking } from './home-selection';
import { createMockProvider } from './fixtures';
import { createRealProvider, CONTRACT_VERSION, CONTRACT_SHA } from './provider';
import type { CatalogPageDTO, ProductCardDTO } from './types';

const card = (id: string): ProductCardDTO => ({ productId: id, slug: 'product-'+id,
  name: 'Product '+id, categoryId: 'cat', brandId: 'brand', image: null });
const select = (overrides: Partial<Parameters<typeof selectHomeProducts>[0]> = {}) => {
  const ranking = jest.fn(async () => ({ hasHistory: true, orderedProductIds: ['seller-2', 'seller-1'] }));
  const random = jest.fn(async () => [card('random')]);
  const load = jest.fn(async (id: string) => card(id));
  return { ranking, random, load, run: () => selectHomeProducts({ ids: [], fallback: true,
    source: 'MOCK', signal: AbortSignal.timeout(5000), load, salesRanking: ranking,
    randomProducts: random, ...overrides }) };
};

it('defined highlights win without reading history or mixing fallback cards', async () => {
  const test = select({ ids: ['editorial'] });
  expect((await test.run()).map(p => p.productId)).toEqual(['editorial']);
  expect(test.ranking).not.toHaveBeenCalled(); expect(test.random).not.toHaveBeenCalled();
});
it('falls through confirmed missing editorial cards to the sales order', async () => {
  const test = select({ ids: ['missing'], load: async id => id === 'missing' ? null : card(id) });
  expect((await test.run()).map(p => p.productId)).toEqual(['seller-2', 'seller-1']);
  expect(test.random).not.toHaveBeenCalled();
});
it('samples only after authoritative absence of history', async () => {
  const test = select({ salesRanking: async () => ({ hasHistory: false, orderedProductIds: [] }) });
  expect((await test.run()).map(p => p.productId)).toEqual(['random']);
  expect(test.random).toHaveBeenCalledTimes(1);
});
it('does not fill a partial editorial selection with best sellers', async () => {
  const test = select({ ids: ['present', 'gone'], load: async id => id === 'gone' ? null : card(id) });
  expect((await test.run()).map(p => p.productId)).toEqual(['present']);
  expect(test.ranking).not.toHaveBeenCalled();
});
it('existing history with no eligible cards remains empty without inventing a cold start', async () => {
  const test = select({ load: async () => null });
  expect(await test.run()).toEqual([]); expect(test.random).not.toHaveBeenCalled();
});
it.each([undefined, async () => { throw new Error('private-source-error'); }])
('unknown or unavailable ranking does not become random products', async salesRanking => {
  const test = select({ salesRanking });
  await expect(test.run()).rejects.toMatchObject({ code: 'CATALOG_UNAVAILABLE' });
  expect(test.random).not.toHaveBeenCalled();
});
it.each([
  { hasHistory: false, orderedProductIds: ['unexpected'] },
  { hasHistory: true, orderedProductIds: ['duplicate', 'duplicate'] },
  { hasHistory: true, orderedProductIds: ['../private'] },
  { hasHistory: true, orderedProductIds: Array.from({ length: 101 }, (_, i) => String(i)) },
  { hasHistory: 'unknown', orderedProductIds: [] },
])('rejects malformed ranking %#', async value => {
  const test = select({ salesRanking: async () => value as SalesRanking });
  await expect(test.run()).rejects.toMatchObject({ diagnostic: 'INVALID_SALES_RANKING' });
  expect(test.random).not.toHaveBeenCalled();
});
it('disabled fallback preserves the existing empty Home without querying sales', async () => {
  const test = select({ fallback: false });
  expect(await test.run()).toEqual([]); expect(test.ranking).not.toHaveBeenCalled();
});
it('bounds an uncooperative sales adapter by the shared abort signal', async () => {
  const controller = new AbortController();
  const test = select({ signal: controller.signal, salesRanking: () => new Promise(() => {}) });
  const result = test.run();
  const assertion = expect(result).rejects.toMatchObject({ code: 'CATALOG_TIMEOUT' });
  controller.abort(); await assertion; expect(test.random).not.toHaveBeenCalled();
});
it.each([0, 1, 3, 8, 73, 1000000])('draws unique bounded positions for total %i', total => {
  const result = randomIndices(total, max => max - 1);
  expect(result).toHaveLength(Math.min(total, 8)); expect(new Set(result).size).toBe(result.length);
  expect(result.every(i => i >= 0 && i < total)).toBe(true);
});
it.each([-1, Number.NaN, 2 ** 48, 1.5])('rejects invalid random universe %s', total => {
  expect(() => randomIndices(total)).toThrow();
});
it('all ordered pairs are reachable exactly once in a three-product cold start', () => {
  const permutations = new Set<string>();
  for (let first = 0; first < 3; first++) for (let second = 0; second < 2; second++) {
    let call = 0;
    permutations.add(randomIndices(3, () => [first, second, 0][call++]).join(','));
  }
  expect(permutations.size).toBe(6);
});

const page = (number: number, size: number, total = 73): CatalogPageDTO => ({ sort: 'NAME_ASC',
  data: Array.from({ length: Math.max(0, Math.min(size, total-number*size)) }, (_, i) => card(String(number*size+i))),
  page: { number, size, totalElements: total, totalPages: Math.ceil(total/size) } });
it('samples positions beyond page one, reuses pages and preserves draw order', async () => {
  const read = jest.fn(async (n: number, size: number) => page(n, size));
  expect((await sampleCatalog(read, max => max-1)).map(p => p.productId)).toEqual(['72','71','70','69','68','67','66','65']);
  expect(read.mock.calls.map(c => c[0]).sort()).toEqual([0,2,3]);
});
it('empty catalog produces a truthful empty result with one bounded read', async () => {
  const read = jest.fn(async (n: number, size: number) => page(n, size, 0));
  expect(await sampleCatalog(read)).toEqual([]); expect(read).toHaveBeenCalledTimes(1);
});
it('rejects observed changes in totals and duplicates between pages', async () => {
  await expect(sampleCatalog(async (n, size) => page(n, size, n === 0 ? 73 : 72), max => max-1))
    .rejects.toMatchObject({ diagnostic: 'RANDOM_CATALOG_CHANGED' });
  await expect(sampleCatalog(async (n, size) => ({ ...page(n,size),
    data: page(n,size).data.map(() => card('duplicate')) }), max => max-1))
    .rejects.toMatchObject({ diagnostic: 'RANDOM_CATALOG_CHANGED' });
});
it('caps page read concurrency at three even with a widely spread sample', async () => {
  let active=0, maximum=0, draw=0;
  await sampleCatalog(async (n,size) => {
    active++; maximum=Math.max(maximum,active); await new Promise<void>(resolve => setImmediate(resolve)); active--;
    return page(n,size,1000);
  }, () => (++draw)*100);
  expect(maximum).toBe(3);
});
it('MOCK exercises historical and cold-start routes without being a REAL failure fallback', async () => {
  const history = createMockProvider({ fallbackEnabled: true, salesProductIds: ['mock-product-7','mock-product-3'] });
  expect((await history.home()).featuredProducts.map(p => p.productId)).toEqual(['mock-product-7','mock-product-3']);
  const cold = createMockProvider({ fallbackEnabled: true, randomIndex: max => max-1 });
  expect((await cold.home()).featuredProducts).toHaveLength(8);
});

const realEnv = { NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true',
  PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-test-token',
  PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
  CATALOG_FEATURED_ENABLED: 'true', CATALOG_FEATURED_APPROVED: 'true', CATALOG_HOME_FALLBACK_ENABLED: 'true' };
it.each(['CATALOG_FEATURED_ENABLED','CATALOG_FEATURED_APPROVED','CATALOG_HOME_FALLBACK_ENABLED'])
('REAL fallback stays gated by %s', async gate => {
  const ranking = jest.fn();
  const provider = createRealProvider({ ...realEnv, [gate]: 'false' },
    async () => Response.json({ categories: [] }), { salesRanking: ranking });
  expect((await provider.home()).featuredProducts).toEqual([]); expect(ranking).not.toHaveBeenCalled();
});
it('REAL without a ranking adapter fails explicitly and ignores synthetic MOCK sales settings', async () => {
  const provider = createRealProvider({ ...realEnv, CATALOG_MOCK_SALES_IDS: 'mock-product-1' },
    async () => Response.json({ categories: [] }));
  await expect(provider.home()).rejects.toMatchObject({ diagnostic: 'SALES_RANKING_NOT_CONFIGURED' });
});
