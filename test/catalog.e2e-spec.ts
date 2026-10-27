import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CATALOG_PROVIDER } from '../src/catalog/types';
import { createMockProvider } from '../src/catalog/fixtures';
import { CartService } from '../src/cart/cart.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { configureApp } from '../src/http/configure-app';

describe('CatalogModule with the baseline AppModule (e2e)', () => {
  let app: INestApplication;
  const mock = createMockProvider();
  const provider = { source: mock.source, home: jest.fn(), filters: jest.fn(), search: jest.fn() };
  const cartService = { getCurrentCart: jest.fn().mockResolvedValue({ cartId: null, version: 0, items: [] }) };
  const originalEnv = { BFF_MODE: process.env.BFF_MODE, DATABASE_URL: process.env.DATABASE_URL, CATALOG_SOURCE: process.env.CATALOG_SOURCE, CORS_ORIGINS: process.env.CORS_ORIGINS };
  const prisma = {
    $queryRaw: jest.fn().mockRejectedValue(new Error('private database failure')),
    cart: { count: jest.fn() }, wishlistItem: { count: jest.fn() },
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/catalog_tests';
    process.env.CATALOG_SOURCE = 'mock';
    process.env.BFF_MODE = 'mock';
    process.env.CORS_ORIGINS = 'http://localhost:3000,https://store.example';
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CATALOG_PROVIDER).useValue(provider)
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(CartService).useValue(cartService).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    provider.home.mockImplementation(() => mock.home());
    provider.filters.mockImplementation(() => mock.filters!());
    provider.search.mockImplementation((query) => mock.search(query));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps anonymous cart and catalog routes mounted in the shared AppModule', async () => {
    const cart = await request(app.getHttpServer()).get('/api/v1/carts/current').expect(200);
    expect(cart.body.data).toEqual({ cartId: null, version: 0, items: [] });
    expect(cart.headers['set-cookie'][0]).toMatch(/^cart_session=[a-f0-9-]+;/);
    expect(cartService.getCurrentCart).toHaveBeenCalledWith(expect.objectContaining({ sessionHash: expect.any(String) }));
    await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
  });

  it('keeps catalog collection and detail identities aligned after integrating develop', async () => {
    const listed = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=running&pageSize=1').expect(200);
    const card = listed.body.data[0];
    const detail = await request(app.getHttpServer()).get('/api/v1/catalog/products/' + card.slug).expect(200);
    expect(detail.body.data).toMatchObject({ productId: card.productId, slug: card.slug, name: card.name });
    expect(detail.body.meta.source).toBe('MOCK');
    expect(detail.headers['x-catalog-source']).toBe('MOCK');
  });

  it.each([
    '/api/v1/catalog/home', '/api/v1/catalog/products?q=running',
    '/api/v1/catalog/products/producto-demostracion-5',
  ])('preserves the proxy correlation through shared bootstrap for %s', async (path) => {
    const result = await request(app.getHttpServer()).get(path).set('X-Request-Id', 'proxy-catalog-integration-01').expect(200);
    expect(result.headers['x-request-id']).toBe('proxy-catalog-integration-01');
    if (path.endsWith('/home')) expect(provider.home).toHaveBeenCalledWith('proxy-catalog-integration-01');
    if (path.includes('?')) expect(provider.search).toHaveBeenCalledWith(expect.anything(), 'proxy-catalog-integration-01');
  });

  it.each([
    ['producto-no-existente-mock', 404, 'PRODUCT_NOT_AVAILABLE'],
    ['producto-error-503-mock', 503, 'PRODUCT_CATALOG_UNAVAILABLE'],
    ['producto-error-504-mock', 504, 'PRODUCT_CATALOG_TIMEOUT'],
  ])('keeps correlated Problem Details for detail %s beside the collection', async (slug, status, code) => {
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products/' + slug)
      .set('X-Request-Id', 'proxy-catalog-integration-02').expect(Number(status));
    expect(result.headers['content-type']).toContain('application/problem+json');
    expect(result.headers['x-request-id']).toBe('proxy-catalog-integration-02');
    expect(result.body).toMatchObject({ code, status: Number(status), requestId: 'proxy-catalog-integration-02',
      instance: '/api/v1/catalog/products/' + slug });
    expect(result.body.type).toMatch(/^https:\/\//);
    expect(result.body.title).toEqual(expect.any(String));
  });

  it('serves home with the original public DTO and source/security headers', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    expect(result.body.categories).toHaveLength(3);
    expect(result.body.featuredProducts).toEqual([]);
    expect(result.headers['x-catalog-source']).toBe('MOCK');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-content-type-options']).toBe('nosniff');
    expect(result.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(provider.home).toHaveBeenCalledWith(result.headers['x-request-id']);
  });

  it('serves active filter masters publicly with no-store and shared correlation', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/filters')
      .set('X-Request-Id', 'h4-masters-01').expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-request-id']).toBe('h4-masters-01');
    expect(result.headers['x-catalog-source']).toBe('MOCK');
    expect(result.body.brands).toEqual([{ brandId: 'mock-brand', name: 'Marca de demostraci\u00f3n' }]);
    expect(provider.filters).toHaveBeenCalledWith('h4-masters-01');
    await request(app.getHttpServer()).get('/api/v1/catalog/filters?estado=INACTIVO').expect(400);
  });

  it('combines filters server-side and rejects an invalid range before querying', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products?brandIds=mock-brand&minPrice=10&maxPrice=20').expect(200);
    expect(result.body.data).toHaveLength(2);
    provider.search.mockClear();
    const invalid = await request(app.getHttpServer()).get('/api/v1/catalog/products?minPrice=20&maxPrice=10').expect(400);
    expect(invalid.body.code).toBe('INVALID_PRICE_RANGE');
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('serves normalized search and the same paging metadata', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=++running++&page=1&pageSize=4').expect(200);
    expect(result.body.data).toHaveLength(4);
    expect(result.body.page).toEqual({ number: 1, size: 4, totalElements: 16, totalPages: 4 });
    expect(provider.search).toHaveBeenCalledWith(expect.objectContaining({ q: 'running', page: 1, pageSize: 4 }), result.headers['x-request-id']);
  });

  it.each([
    ['q=x', 'INVALID_SEARCH_QUERY'], ['q=running&q=polo', 'INVALID_PARAMETERS'],
    ['page=-1', 'INVALID_PAGE'], ['categoryIds=a,b', 'INVALID_FILTER'], ['sort=PRICE_ASC', 'INVALID_SORT'],
  ])('rejects invalid URL %s before invoking the provider', async (query, code) => {
    const result = await request(app.getHttpServer()).get(`/api/v1/catalog/products?${query}`).expect(400);
    expect(result.headers['content-type']).toContain('application/problem+json');
    expect(result.body.code).toBe(code);
    expect(result.body.requestId).toBe(result.headers['x-request-id']);
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('keeps a valid empty page successful', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=zzzzzz').expect(200);
    expect(result.body.data).toEqual([]);
    expect(result.body.page.totalElements).toBe(0);
  });

  it('returns a safe 503 for unexpected provider exceptions without a mock fallback', async () => {
    provider.search.mockRejectedValue(new Error('private token and upstream payload'));
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=polo').expect(503);
    expect(result.body.code).toBe('CATALOG_UNAVAILABLE');
    expect(result.body.requestId).toBe(result.headers['x-request-id']);
    expect(JSON.stringify(result.body)).not.toMatch(/private|token|upstream/);
    expect(provider.search).toHaveBeenCalledTimes(1);
  });

  it('retains the baseline multi-origin CORS behavior', async () => {
    for (const origin of ['http://localhost:3000', 'https://store.example']) {
      const allowed = await request(app.getHttpServer()).get('/api/v1/catalog/home').set('Origin', origin).expect(200);
      expect(allowed.headers['access-control-allow-origin']).toBe(origin);
    }
    const denied = await request(app.getHttpServer()).get('/api/v1/catalog/home').set('Origin', 'https://evil.example').expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app.getHttpServer()).options('/api/v1/catalog/products').set('Origin', 'https://store.example').set('Access-Control-Request-Method', 'GET').expect(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('https://store.example');
  });

  it('rejects writes to the read-only catalog with a safe 405', async () => {
    const result = await request(app.getHttpServer()).post('/api/v1/catalog/products').expect(405);
    expect(result.headers.allow).toBe('GET, OPTIONS');
    expect(result.body.code).toBe('METHOD_NOT_ALLOWED');
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('preserves baseline liveness/readiness and keeps catalog independent of DB availability', async () => {
    await request(app.getHttpServer()).get('/live').expect(200);
    const ready = await request(app.getHttpServer()).get('/ready').expect(503);
    expect(ready.body.database.connected).toBe(false);
    expect(JSON.stringify(ready.body)).not.toContain('private database failure');
    await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    const missing = await request(app.getHttpServer()).get('/missing-route').expect(404);
    expect(missing.body).toEqual({ error: 'Ruta no encontrada' });
  });

  it('logs correlation and a hash rather than the raw search or credentials', async () => {
    await request(app.getHttpServer()).get('/api/v1/catalog/products?q=private-search-term').expect(200);
    const logs = JSON.stringify((Logger.prototype.log as jest.Mock).mock.calls);
    expect(logs).toContain('queryHash');
    expect(logs).toContain('requestId');
    expect(logs).not.toContain('private-search-term');
  });
});
