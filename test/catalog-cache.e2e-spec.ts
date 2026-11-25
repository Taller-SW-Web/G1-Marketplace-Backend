import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CatalogController } from '../src/catalog/catalog.controller';
import { CatalogExceptionFilter } from '../src/catalog/catalog-exception.filter';
import { CatalogRequestInterceptor } from '../src/catalog/catalog-request.interceptor';
import { CatalogService } from '../src/catalog/catalog.service';
import { CATALOG_PROVIDER } from '../src/catalog/types';
import { configureApp } from '../src/http/configure-app';

describe('Public catalog cache and compression (local MOCK)', () => {
  let app: INestApplication;
  const provider = {
    source: 'MOCK',
    home: jest.fn(),
    filters: jest.fn(),
    search: jest.fn(),
  } as const;
  const home = { categories: [{ categoryId: 'running', name: 'Running' }], featuredProducts: [] };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        load: [() => ({ CATALOG_CACHE_TTL_MS: 10000, CORS_ORIGINS: [] })],
      })],
      controllers: [CatalogController],
      providers: [
        CatalogService,
        CatalogExceptionFilter,
        CatalogRequestInterceptor,
        { provide: CATALOG_PROVIDER, useValue: provider },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    provider.home.mockResolvedValue(home);
    provider.filters.mockResolvedValue({ categories: [], brands: [] });
    provider.search.mockResolvedValue({ sort: null, data: [], page: { number: 0, size: 24, totalElements: 0, totalPages: 0 } });
  });

  afterAll(async () => app?.close());

  it('keeps successful public reads no-store while local process caching is configured', async () => {
    const first = await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    const second = await request(app.getHttpServer()).get('/api/v1/catalog/home')
      .set('X-Request-Id', 'catalog-cache-hit').expect(200);

    expect(first.headers['cache-control']).toBe('no-store');
    expect(second.headers['cache-control']).toBe('no-store');
    expect(second.headers['x-request-id']).toBe('catalog-cache-hit');
    expect(second.body).toEqual(first.body);
    expect(provider.home).toHaveBeenCalledTimes(1);
  });

  it('keeps provider failures non-cacheable and retries the provider next time', async () => {
    provider.search.mockRejectedValueOnce(new Error('temporary provider failure'));
    await request(app.getHttpServer()).get('/api/v1/catalog/products?q=retry').expect(503)
      .then((result) => expect(result.headers['cache-control']).toBe('no-store'));
    await request(app.getHttpServer()).get('/api/v1/catalog/products?q=retry').expect(200);
    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it('compresses a large public catalog response only when the client accepts gzip', async () => {
    provider.search.mockResolvedValue({
      sort: null,
      data: Array.from({ length: 48 }, (_, index) => ({
        productId: `PRD-${index}`,
        slug: `product-${index}`,
        name: `Product ${index} with a longer catalog title`,
        categoryId: 'running',
        brandId: 'mock-brand',
        image: { url: `https://images.example.test/product-${index}.jpg`, alt: `Product ${index}` },
      })),
      page: { number: 0, size: 48, totalElements: 48, totalPages: 1 },
    });

    const compressed = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=running&pageSize=48')
      .set('Accept-Encoding', 'gzip').expect(200);
    expect(compressed.headers['content-encoding']).toBe('gzip');
    expect(compressed.headers.vary).toContain('Accept-Encoding');
    expect(compressed.body.data).toHaveLength(48);

    const uncompressed = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=other&pageSize=48')
      .set('Accept-Encoding', 'identity').expect(200);
    expect(uncompressed.headers['content-encoding']).toBeUndefined();
  });
});
