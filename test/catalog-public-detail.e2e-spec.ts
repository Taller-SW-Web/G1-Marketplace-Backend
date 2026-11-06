import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../src/catalog/catalog.module';
import { ProductDetailModule } from '../src/catalog/product-detail.module';
import { CONTRACT_SHA, CONTRACT_VERSION } from '../src/catalog/g6-client';
import { requestIdMiddleware } from '../src/http/request-id.middleware';
import { NotFoundFilter } from '../src/http/not-found.filter';

describe('BFF HTTP -> G6 public-read-only HTTP (controlled upstream, no mocks fallback)', () => {
  let app: INestApplication;
  let upstream: Server;
  const before = { ...process.env };
  let seen: { method?: string; path?: string; authorization?: string; cookie?: string; correlation?: string }[];
  let mode: 'ok' | 'brands503' | 'unauthorized' | 'missing' | 'invalid' | 'timeout' | 'redirect';
  const product = { product_id: 'product-from-g6', slug: 'polo-real', name: 'Polo proveedor', categoria_id: 'cat', marca_id: 'brand',
    marca: { marca_id: 'brand', name: 'Marca proveedor' }, description: 'Descripcion G6',
    images: ['https://images.example/real.png'], attributes: [{ nombre: 'Color', valor: 'Azul' }] };

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      seen.push({ method: req.method, path: req.url, authorization: req.headers.authorization,
        cookie: req.headers.cookie, correlation: String(req.headers['x-correlation-id']) });
      if (mode === 'timeout') return;
      const json = (body: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (mode === 'unauthorized') return json({ code: 'TOKEN_INVALIDO' }, 401);
      if (mode === 'missing') return json({ code: 'PRODUCTO_NO_ENCONTRADO' }, 404);
      if (mode === 'invalid') return json({ invalid: true });
      if (mode === 'redirect') { res.setHeader('Location', '/api/v1/marcas/administracion'); return json({}, 302); }
      const path = new URL(req.url!, 'http://local').pathname;
      if (path === '/api/v1/categorias') return json({ categories: [{ categoria_id: 'cat', name: 'Categoria real', status: 'ACTIVA' }] });
      if (path === '/api/v1/marcas') return mode === 'brands503' ? json({}, 503) : json({ brands: [{ marca_id: 'brand', name: 'Marca real', status: 'ACTIVA' }] });
      if (path === '/api/v1/productos') return json({ items: [product], total: 1, pagina: 1, tamanio: 24 });
      if (path === '/api/v1/productos/por-slug/polo-real') return json(product);
      return json({}, 404);
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Missing upstream port');
    const env = { NODE_ENV: 'test', CATALOG_SOURCE: 'real', BFF_MODE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
      PRODUCTOS_AUTH_MODE: 'public-read-only', PRODUCTOS_BASE_URL: `http://127.0.0.1:${address.port}`,
      PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
      PRODUCTOS_MEDIA_HOSTS: 'images.example', PRODUCTOS_TIMEOUT_MS: '150', PRODUCTOS_SERVICE_TOKEN: 'synthetic-stale-marker' };
    Object.assign(process.env, env);
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true, load: [() => env] }),
      CatalogModule, ProductDetailModule,
    ] }).compile();
    app = module.createNestApplication({ logger: false });
    app.use(requestIdMiddleware);
    app.useGlobalFilters(new NotFoundFilter());
    await app.init();
  });
  beforeEach(() => { mode = 'ok'; seen = []; });
  afterAll(async () => {
    await app.close();
    upstream.closeAllConnections();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    process.env = before;
  });

  it('reads real categories, brands, listing and detail without forwarding a visitor/service credential', async () => {
    const id = 'a891739e-640e-411f-a1c9-ef704593bbf2';
    for (const path of ['home', 'filters', 'products', 'products/polo-real']) {
      const res = await request(app.getHttpServer()).get('/api/v1/catalog/' + path)
        .set('Authorization', 'Bearer synthetic-browser-marker').set('Cookie', 'visitor=synthetic-marker').set('X-Request-Id', id).expect(200);
      expect(res.headers['x-catalog-source']).toBe('REAL');
      expect(res.headers['x-request-id']).toBe(id);
      if (path === 'filters') expect(res.body.brands).toEqual([{ brandId: 'brand', name: 'Marca real' }]);
      if (path === 'products/polo-real') {
        expect(res.body.meta.source).toBe('REAL');
        expect(res.body.data.productId).toBe('product-from-g6');
        expect(res.body.data.brand.name).toBe('Marca proveedor');
      }
    }
    expect(seen.length).toBe(5);
    for (const call of seen) expect(call).toMatchObject({ method: 'GET', authorization: undefined, cookie: undefined, correlation: id });
  });
  it('does not replace unavailable brands with fixtures', async () => {
    mode = 'brands503';
    const res = await request(app.getHttpServer()).get('/api/v1/catalog/filters').expect(503);
    expect(res.body.code).toBe('CATALOG_UNAVAILABLE');
    expect(res.body).not.toHaveProperty('brands');
  });
  it.each([['unauthorized', 503, 'PRODUCT_CATALOG_UNAVAILABLE'], ['missing', 404, 'PRODUCT_NOT_AVAILABLE'],
    ['invalid', 502, 'PRODUCT_CATALOG_INVALID_RESPONSE'], ['timeout', 504, 'PRODUCT_CATALOG_TIMEOUT'],
    ['redirect', 503, 'PRODUCT_CATALOG_UNAVAILABLE']] as const)
    ('detail preserves %s failure and never falls back', async (failure, status, code) => {
      mode = failure;
      const res = await request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real').expect(status);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.headers['x-catalog-source']).toBe('REAL');
      expect(res.body.code).toBe(code);
      expect(res.body).not.toHaveProperty('data');
      expect(seen.length).toBe(1);
    });
  it('rejects mutation methods and bad slugs without calling G6', async () => {
    await request(app.getHttpServer()).post('/api/v1/catalog/products').send({}).expect(405);
    await request(app.getHttpServer()).post('/api/v1/catalog/products/polo-real').send({}).expect(404);
    await request(app.getHttpServer()).get('/api/v1/catalog/products/INVALID!').expect(400);
    expect(seen).toHaveLength(0);
  });
});
