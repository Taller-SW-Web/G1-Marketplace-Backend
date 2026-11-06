import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ProductCommerceModule } from '../src/catalog/product-commerce.module';
import { CONTRACT_SHA, CONTRACT_VERSION } from '../src/catalog/g6-client';
import { requestIdMiddleware } from '../src/http/request-id.middleware';

describe('F013 HTTP -> existing commercial detail GET', () => {
  let app: INestApplication;
  let upstream: Server;
  const before = { ...process.env };
  let mode: string;
  let seen: { method?: string; path?: string; authorization?: string; cookie?: string; correlation?: string }[];
  const detail = () => ({ product_id: 'g6-product', slug: 'polo-real', name: 'Polo G6', tiene_variantes: true,
    variants: [{ variant_id: 'g6-variant', sku: 'G6-AZUL-M', images: [], identifying_attributes: [
      { caracteristica_id: 'color', nombre: 'Color', valor_id: 'blue', valor: { valor_id: 'blue', nombre: 'Azul' } },
    ] }] });
  beforeAll(async () => {
    upstream = createServer((req, res) => {
      seen.push({ method: req.method, path: req.url, authorization: req.headers.authorization,
        cookie: req.headers.cookie, correlation: String(req.headers['x-correlation-id']) });
      const json = (body: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (mode === 'timeout') return;
      if (mode === 'missing') return json({ code: 'PRODUCTO_NO_ENCONTRADO' }, 404);
      if (mode === 'unavailable') return json({ private: 'must-not-leak' }, 503);
      if (mode === 'unauthorized') return json({ private: 'must-not-leak' }, 401);
      if (mode === 'redirect') { res.setHeader('Location', '/api/v1/admin'); return json({}, 302); }
      if (mode === 'invalid-json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{'); }
      if (mode === 'invalid') return json({ ...detail(), slug: 'foreign-product' });
      if (mode === 'unresolved') { const p: any = detail(); p.variants[0].identifying_attributes[0].valor = { valor_id: 'blue' }; return json(p); }
      return json(detail());
    });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    Object.assign(process.env, { NODE_ENV: 'test', CATALOG_SOURCE: 'real', BFF_MODE: 'real',
      CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_AUTH_MODE: 'public-read-only',
      PRODUCTOS_BASE_URL: `http://127.0.0.1:${(upstream.address() as { port: number }).port}`,
      PRODUCTOS_SERVICE_TOKEN: 'synthetic-stale-token', PRODUCTOS_TIMEOUT_MS: '150',
      PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
    });
    const module = await Test.createTestingModule({ imports: [ProductCommerceModule] }).compile();
    app = module.createNestApplication({ logger: false }); app.use(requestIdMiddleware); await app.init();
  });
  beforeEach(() => { mode = 'ok'; seen = []; });
  afterAll(async () => { await app?.close(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); process.env = before; });

  it('uses one detail GET, maps the SKU and preserves correlation without visitor/server credentials', async () => {
    const id = '6916f9f8-4ba0-49ef-bf91-8d70d7a8dffe';
    const r = await request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real/variants')
      .set('X-Request-Id', id).set('Authorization', 'Bearer synthetic-visitor').set('Cookie', 'visitor=synthetic').expect(200);
    expect(r.headers['x-catalog-source']).toBe('REAL'); expect(r.headers['x-request-id']).toBe(id);
    expect(r.body.data.variants[0].sku).toBe('G6-AZUL-M');
    expect(r.body.data.attributes[0].values).toEqual([{ id: 'blue', label: 'Azul' }]);
    expect(seen).toEqual([{ method: 'GET', path: '/api/v1/productos/por-slug/polo-real?canal=MARKETPLACE',
      authorization: undefined, cookie: undefined, correlation: id }]);
    expect(JSON.stringify(r.body)).not.toContain('synthetic');
  });
  it.each([
    ['missing', 404, 'PRODUCT_NOT_AVAILABLE'], ['unavailable', 503, 'CATALOG_UNAVAILABLE'],
    ['unauthorized', 503, 'CATALOG_UNAVAILABLE'], ['redirect', 503, 'CATALOG_UNAVAILABLE'],
    ['timeout', 504, 'CATALOG_TIMEOUT'], ['invalid-json', 502, 'CATALOG_INVALID_RESPONSE'],
    ['invalid', 502, 'CATALOG_INVALID_RESPONSE'], ['unresolved', 502, 'CATALOG_INVALID_RESPONSE'],
  ])('preserves %s without fixture fallback', async (failure, status, code) => {
    mode = failure;
    const r = await request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real/variants').expect(status);
    expect(r.headers['x-catalog-source']).toBe('REAL'); expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.body.code).toBe(code); expect(r.body).not.toHaveProperty('data');
    expect(JSON.stringify(r.body)).not.toContain('must-not-leak'); expect(seen).toHaveLength(1);
  });
  it('fails closed on inconsistent real configuration instead of serving mock fixtures', async () => {
    process.env.BFF_MODE = 'mock';
    try { const r = await request(app.getHttpServer()).get('/api/v1/catalog/products/producto-variable-mock/variants').expect(503); expect(r.body).not.toHaveProperty('data'); expect(seen).toHaveLength(0); }
    finally { process.env.BFF_MODE = 'real'; }
  });
  it('does not call G6 for a bad slug or a write', async () => {
    await request(app.getHttpServer()).get('/api/v1/catalog/products/INVALID!/variants').expect(400);
    await request(app.getHttpServer()).post('/api/v1/catalog/products/polo-real/variants').send({}).expect(404);
    expect(seen).toHaveLength(0);
  });
  it('keeps price and availability unavailable without calling G6', async () => {
    await request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real/price').expect(503);
    await request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real/availability').expect(503);
    expect(seen).toHaveLength(0);
  });
});
