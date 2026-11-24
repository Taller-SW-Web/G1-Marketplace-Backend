import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseQuery } from './query';
import { CatalogError } from './errors';
import { CATALOG_PROVIDER } from './types';
import type { CatalogProvider, CatalogSource, CatalogPageDTO, HomeDTO } from './types';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const MAX_CATALOG_CACHE_ENTRIES = 256;

@Injectable()
export class CatalogService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly cacheTtlMs: number;

  constructor(
    @Inject(CATALOG_PROVIDER) private readonly provider: CatalogProvider,
    @Optional() config?: ConfigService,
  ) {
    this.cacheTtlMs = config?.get<number>('CATALOG_CACHE_TTL_MS', 0) ?? 0;
  }

  get source(): CatalogSource { return this.provider.source; }

  cacheControlFor(url: URL): string {
    if (this.cacheTtlMs <= 0) return 'no-store';

    let key: string;
    switch (url.pathname) {
      case '/api/v1/catalog/home':
        key = this.homeCacheKey();
        break;
      case '/api/v1/catalog/filters':
        key = this.filtersCacheKey();
        break;
      case '/api/v1/catalog/products':
        key = this.searchCacheKey(parseQuery(url.searchParams));
        break;
      default:
        return 'no-store';
    }

    const remainingMs = (this.cache.get(key)?.expiresAt ?? 0) - Date.now();
    const remainingSeconds = Math.floor(remainingMs / 1000);
    if (remainingSeconds < 1) return 'no-store';

    // The shared cache can only use the remaining process-cache lifetime, not
    // a fresh full TTL that would extend the total staleness window.
    return `public, max-age=0, s-maxage=${remainingSeconds}, must-revalidate`;
  }

  filters(params: URLSearchParams, requestId: string) {
    if (params.size) throw new CatalogError('INVALID_PARAMETERS', 400);
    if (!this.provider.filters) throw new CatalogError('CATALOG_UNAVAILABLE', 503);
    return this.loadThroughCache(
      this.filtersCacheKey(),
      () => this.provider.filters!(requestId),
    );
  }

  home(params: URLSearchParams, requestId: string): Promise<HomeDTO> {
    if (params.size) throw new CatalogError('INVALID_PARAMETERS', 400);
    return this.loadThroughCache(
      this.homeCacheKey(),
      () => this.provider.home(requestId),
    );
  }

  search(params: URLSearchParams, requestId: string): Promise<CatalogPageDTO> {
    const query = parseQuery(params);
    return this.loadThroughCache(
      this.searchCacheKey(query),
      () => this.provider.search(query, requestId),
    );
  }

  private homeCacheKey(): string {
    return `catalog:${this.provider.source}:home`;
  }

  private filtersCacheKey(): string {
    return `catalog:${this.provider.source}:filters`;
  }

  private searchCacheKey(query: ReturnType<typeof parseQuery>): string {
    return `catalog:${this.provider.source}:search:${JSON.stringify(query)}`;
  }

  private loadThroughCache<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (this.cacheTtlMs <= 0) return load();

    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      // Refresh insertion order so eviction is least-recently-used.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return Promise.resolve(cached.value as T);
    }
    if (cached) this.cache.delete(key);

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const request = Promise.resolve()
      .then(load)
      .then((value) => {
        this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
        while (this.cache.size > MAX_CATALOG_CACHE_ENTRIES) {
          const oldestKey = this.cache.keys().next().value as string | undefined;
          if (oldestKey === undefined) break;
          this.cache.delete(oldestKey);
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
}
