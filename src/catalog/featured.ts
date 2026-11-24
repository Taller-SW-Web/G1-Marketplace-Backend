import { CatalogError } from './errors';
import type { CatalogEnvironment, ProductCardDTO } from './types';

export const MAX_FEATURED_PRODUCTS = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Selection is editorial G1 configuration; product facts remain authoritative in G6. */
export function configuredFeaturedIds(env: CatalogEnvironment, source: 'MOCK' | 'REAL'): string[] {
  if (env.CATALOG_FEATURED_ENABLED !== 'true' ||
      (source === 'REAL' && env.CATALOG_FEATURED_APPROVED !== 'true')) return [];
  const raw = env.CATALOG_FEATURED_IDS ?? '';
  if (raw.length > 2048) throw new CatalogError('CATALOG_UNAVAILABLE', 503, 'INVALID_FEATURED_CONFIG');
  if (!raw.trim()) return [];
  const ids = raw.split(',').map(id => source === 'REAL' ? id.trim().toLowerCase() : id.trim());
  if (ids.length > MAX_FEATURED_PRODUCTS || new Set(ids).size !== ids.length ||
      ids.some(id => source === 'REAL' ? !UUID.test(id) : !/^[A-Za-z0-9_-]{1,120}$/.test(id)))
    throw new CatalogError('CATALOG_UNAVAILABLE', 503, 'INVALID_FEATURED_CONFIG');
  return ids;
}

/** Bounded parallel reads preserve the editorial order, including omission of confirmed absences. */
export async function resolveFeatured(
  ids: readonly string[],
  load: (id: string) => Promise<ProductCardDTO | null>,
): Promise<ProductCardDTO[]> {
  const output: Array<ProductCardDTO | null> = Array(ids.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const index = cursor++;
      output[index] = await load(ids[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));
  return output.filter((card): card is ProductCardDTO => card !== null);
}
