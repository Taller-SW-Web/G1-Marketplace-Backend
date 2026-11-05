// Local HTTP double of G6. REAL identifies the adapter path, not external grants or deployment.
import * as http from 'node:http';
import { once } from 'node:events';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogController } from '../src/catalog/catalog.controller';
import { CatalogService } from '../src/catalog/catalog.service';
import { CatalogExceptionFilter } from '../src/catalog/catalog-exception.filter';
import { CatalogRequestInterceptor } from '../src/catalog/catalog-request.interceptor';
import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from '../src/catalog/provider';
import { CATALOG_PROVIDER } from '../src/catalog/types';

const ids = ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'];
const product = (id: string) => ({ product_id: id, slug: 'product-'+id, name: 'Owner '+id,
  categoria_id: 'cat', marca_id: 'brand', images: [], variants: [], private_field: 'must-not-publish' });

describe('F006 editorial projection: local BFF -> HTTP double', () => {
  let app: INestApplication, upstream: http.Server;
  let mode = 'valid';
  let seen: Array<{ url: string; auth?: string; correlation?: string }> = [];
  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      seen.push({ url: req.url!, auth: req.headers.authorization, correlation: req.headers['x-correlation-id'] as string });
      res.setHeader('Content-Type', 'application/json');
      const url = new URL(req.url!, 'http://local');
      if (url.pathname.endsWith('/categorias')) return void res.end(JSON.stringify({ categories: [] }));
      const id = url.pathname.split('/').pop()!;
      if (!ids.includes(id) || url.searchParams.get('canal') !== 'MARKETPLACE') { res.statusCode=400; return void res.end('{}'); }
      if (id === ids[0] && mode === 'missing') { res.statusCode=404; return void res.end(JSON.stringify({ code: 'PRODUCTO_NO_ENCONTRADO' })); }
      if (id === ids[0] && mode === 'unavailable') { res.statusCode=503; return void res.end(JSON.stringify({ private: 'not-public' })); }
      const item = product(id);
      if (id === ids[0] && mode === 'inactive') Object.assign(item, { status: 'INACTIVO' });
      if (id === ids[0] && mode === 'mismatch') item.product_id = 'other-product';
      if (id === ids[0] && mode === 'unsafe-image') item.images = ['https://unapproved.example/image.png'] as never[];
      res.end(JSON.stringify(item));
    });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const address = upstream.address() as { port: number };
    const provider = createRealProvider({ NODE_ENV: 'test', CATALOG_INTEGRATION_APPROVED: 'true',
      PRODUCTOS_BASE_URL: `http://127.0.0.1:${address.port}`, PRODUCTOS_SERVICE_TOKEN: 'synthetic-test-token',
      PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
      CATALOG_FEATURED_ENABLED: 'true', CATALOG_FEATURED_APPROVED: 'true', CATALOG_FEATURED_IDS: ids.join(',') });
    const module = await Test.createTestingModule({ controllers: [CatalogController], providers: [
      CatalogService, CatalogExceptionFilter, CatalogRequestInterceptor, { provide: CATALOG_PROVIDER, useValue: provider },
    ] }).compile();
    app = module.createNestApplication({ logger: false }); await app.init();
  });
  beforeEach(() => { mode = 'valid'; seen = []; });
  afterAll(async () => { await app.close(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); });

  it('projects editorial order and owner fields with server-only identity and public correlation', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/catalog/home')
      .set('Authorization', 'Bearer visitor-must-not-forward').expect(200);
    expect(response.headers['x-catalog-source']).toBe('REAL');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.featuredProducts.map((p: { productId: string }) => p.productId)).toEqual(ids);
    expect(response.body.featuredProducts.every((p: unknown) => Object.keys(p as object).length === 6)).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/private_field|variants|synthetic-test-token/);
    expect(seen).toHaveLength(3);
    expect(seen.every(item => item.auth === 'Bearer synthetic-test-token')).toBe(true);
    expect(seen.every(item => item.correlation === response.headers['x-request-id'])).toBe(true);
  });
  it.each(['missing', 'inactive'])('omits confirmed %s without inventing a replacement', async next => {
    mode = next;
    const response = await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    expect(response.body.featuredProducts.map((p: { productId: string }) => p.productId)).toEqual([ids[1]]);
  });
  it.each(['unavailable', 'mismatch', 'unsafe-image'])('keeps technical %s as an error instead of an empty success', async next => {
    mode = next;
    const response = await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(503);
    expect(response.body.code).toBe('CATALOG_UNAVAILABLE');
    expect(response.body).not.toHaveProperty('featuredProducts');
    expect(JSON.stringify(response.body)).not.toMatch(/private_field|synthetic-test-token|unapproved/);
  });
});
