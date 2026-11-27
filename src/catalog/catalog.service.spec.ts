import { ConfigService } from '@nestjs/config';
import type { CatalogProvider } from './types';
import { CatalogService } from './catalog.service';

describe('CatalogService public read cache', () => {
  const home = { categories: [{ categoryId: 'running', name: 'Running' }], featuredProducts: [] };
  const page = { sort: null, data: [], page: { number: 0, size: 24, totalElements: 0, totalPages: 0 } };
  let provider: jest.Mocked<CatalogProvider>;
  let now: number;

  function createService(ttlMs: number): CatalogService {
    const config = { get: jest.fn(() => ttlMs) } as unknown as ConfigService;
    return new CatalogService(provider, config);
  }

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    provider = {
      source: 'MOCK',
      home: jest.fn().mockResolvedValue(home),
      filters: jest.fn().mockResolvedValue({ categories: [], brands: [] }),
      search: jest.fn().mockResolvedValue(page),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it('coalesces concurrent public reads and reuses the result until TTL expires', async () => {
    const service = createService(1000);
    const first = service.home(new URLSearchParams(), 'request-first');
    const concurrent = service.home(new URLSearchParams(), 'request-concurrent');
    await expect(Promise.all([first, concurrent])).resolves.toEqual([home, home]);
    await expect(service.home(new URLSearchParams(), 'request-cache-hit')).resolves.toEqual(home);
    expect(provider.home).toHaveBeenCalledTimes(1);
    expect(provider.home).toHaveBeenCalledWith('request-first');
    expect(service.cacheControlFor(new URL('http://localhost/api/v1/catalog/home')))
      .toBe('no-store');

    now += 1001;
    await service.home(new URLSearchParams(), 'request-after-expiry');
    expect(provider.home).toHaveBeenCalledTimes(2);
  });

  it('keeps the HTTP contract no-store while a local process cache is configured', async () => {
    const service = createService(3000);
    const url = new URL('http://localhost/api/v1/catalog/home');
    await service.home(new URLSearchParams(), 'request-one');
    expect(service.cacheControlFor(url)).toBe('no-store');

    now += 1200;
    expect(service.cacheControlFor(url)).toBe('no-store');

    now += 2000;
    expect(service.cacheControlFor(url)).toBe('no-store');
  });

  it('keys search responses by normalized criteria and does not cache provider errors', async () => {
    const service = createService(1000);
    await service.search(new URLSearchParams('q=%20running%20&pageSize=24'), 'request-one');
    await service.search(new URLSearchParams('pageSize=24&q=running'), 'request-two');
    expect(provider.search).toHaveBeenCalledTimes(1);

    provider.search.mockRejectedValueOnce(new Error('temporary provider failure'));
    await expect(service.search(new URLSearchParams('q=polo'), 'request-error')).rejects.toThrow('temporary provider failure');
    await service.search(new URLSearchParams('q=polo'), 'request-retry');
    expect(provider.search).toHaveBeenCalledTimes(3);
  });

  it('bounds search entries and evicts the least-recently-used key', async () => {
    const service = createService(1000);
    const search = (index: number) => service.search(
      new URLSearchParams(`q=product-${index}`),
      `request-${index}`,
    );

    for (let index = 0; index < 256; index += 1) await search(index);
    expect(provider.search).toHaveBeenCalledTimes(256);

    await search(0); // Promote the oldest entry to most recently used.
    await search(256); // Evict the next-oldest entry.
    await search(0);
    expect(provider.search).toHaveBeenCalledTimes(257);

    await search(1); // The least-recently-used entry was evicted.
    expect(provider.search).toHaveBeenCalledTimes(258);
  });

  it('keeps cache disabled when TTL is zero', async () => {
    const service = createService(0);
    await service.home(new URLSearchParams(), 'request-one');
    await service.home(new URLSearchParams(), 'request-two');
    expect(provider.home).toHaveBeenCalledTimes(2);
    expect(service.cacheControlFor(new URL('http://localhost/api/v1/catalog/home'))).toBe('no-store');
  });
});
