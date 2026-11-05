import { randomInt } from 'node:crypto';
import { CatalogError } from './errors';
import { MAX_FEATURED_PRODUCTS, resolveFeatured } from './featured';
import type { CatalogPageDTO, ProductCardDTO } from './types';

/** Server-only port. Empty means authoritative absence of sales, never unavailable/unknown. */
export interface SalesRanking { hasHistory: boolean; orderedProductIds: readonly string[] }
export interface HomeSelectionSources {
  salesRanking?: (signal: AbortSignal, requestId?: string) => Promise<SalesRanking>;
  randomIndex?: (exclusiveMax: number) => number;
}
export const CATALOG_HOME_SOURCES = Symbol('CATALOG_HOME_SOURCES');
const unavailable = (reason: string) => new CatalogError('CATALOG_UNAVAILABLE', 503, reason);

async function withinBudget<T>(signal: AbortSignal, read: () => Promise<T>): Promise<T> {
  if (signal.aborted) throw new CatalogError('CATALOG_TIMEOUT', 503, 'HOME_SELECTION_TIMEOUT');
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new CatalogError('CATALOG_TIMEOUT', 503, 'HOME_SELECTION_TIMEOUT'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(read).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function rankingIds(value: SalesRanking, source: 'MOCK' | 'REAL'): string[] | null {
  if (!value || typeof value.hasHistory !== 'boolean' || !Array.isArray(value.orderedProductIds) ||
      value.orderedProductIds.length > 100 || (!value.hasHistory && value.orderedProductIds.length))
    throw unavailable('INVALID_SALES_RANKING');
  const ids = value.orderedProductIds.map((id: unknown) => {
    if (typeof id !== 'string' || (source === 'REAL'
      ? !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      : !/^[A-Za-z0-9_-]{1,120}$/.test(id))) throw unavailable('INVALID_SALES_RANKING');
    return source === 'REAL' ? id.toLowerCase() : id;
  });
  if (new Set(ids).size !== ids.length) throw unavailable('INVALID_SALES_RANKING');
  return value.hasHistory ? ids.slice(0, MAX_FEATURED_PRODUCTS) : null;
}

export async function selectHomeProducts(options: {
  ids: readonly string[]; load: (id: string) => Promise<ProductCardDTO | null>;
  fallback: boolean; source: 'MOCK' | 'REAL'; signal: AbortSignal;
  salesRanking?: () => Promise<SalesRanking>; randomProducts: () => Promise<ProductCardDTO[]>;
}): Promise<ProductCardDTO[]> {
  return withinBudget(options.signal, async () => {
    const editorial = await resolveFeatured(options.ids, options.load);
    if (editorial.length || !options.fallback) return editorial;
    if (!options.salesRanking) throw unavailable('SALES_RANKING_NOT_CONFIGURED');
    let snapshot: SalesRanking;
    try { snapshot = await withinBudget(options.signal, options.salesRanking); }
    catch (error) {
      if (error instanceof CatalogError) throw error;
      throw unavailable('SALES_RANKING_UNAVAILABLE');
    }
    const ids = rankingIds(snapshot, options.source);
    // Existing history, even with no currently eligible cards, is not a cold start.
    if (ids !== null) return resolveFeatured(ids, options.load);
    return options.randomProducts();
  });
}

/** Uniform draws without replacement, O(limit) memory; never shuffle just page one. */
export function randomIndices(total: number, pick: (max: number) => number = randomInt): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || total >= 2 ** 48) throw unavailable('INVALID_RANDOM_UNIVERSE');
  const swaps = new Map<number, number>(), result: number[] = [];
  for (let i = 0; i < Math.min(total, MAX_FEATURED_PRODUCTS); i++) {
    const remaining = total - i, chosen = pick(remaining);
    if (!Number.isInteger(chosen) || chosen < 0 || chosen >= remaining) throw unavailable('INVALID_RANDOM_DRAW');
    result.push(swaps.get(chosen) ?? chosen);
    swaps.set(chosen, swaps.get(remaining - 1) ?? remaining - 1);
  }
  return result;
}

/** Existing G1 page size, at most nine page reads / three in flight, one Home deadline. */
export async function sampleCatalog(
  read: (page: number, size: number) => Promise<CatalogPageDTO>,
  pick?: (max: number) => number,
): Promise<ProductCardDTO[]> {
  const size = 24, first = await read(0, size), total = first.page.totalElements;
  const indices = randomIndices(total, pick), pages = new Map([[0, first]]);
  const needed = [...new Set(indices.map(index => Math.floor(index / size)))].filter(page => page !== 0);
  let cursor = 0;
  async function worker() {
    while (cursor < needed.length) {
      const number = needed[cursor++], page = await read(number, size);
      if (page.page.totalElements !== total) throw unavailable('RANDOM_CATALOG_CHANGED');
      pages.set(number, page);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, needed.length) }, worker));
  const result = indices.map(index => pages.get(Math.floor(index / size))?.data[index % size]);
  if (result.some(item => !item) || new Set(result.map(item => item?.productId)).size !== result.length)
    throw unavailable('RANDOM_CATALOG_CHANGED');
  return result as ProductCardDTO[];
}
