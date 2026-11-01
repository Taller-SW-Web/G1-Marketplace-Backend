import { INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { once } from 'node:events';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import request from 'supertest';
import { CatalogModule } from '../src/catalog/catalog.module';
import { CONTRACT_SHA, CONTRACT_VERSION } from '../src/catalog/provider';

// Local HTTP contract rehearsal, NOT G6 authentication, business eligibility or deployment.
// Source: G6 docs c36bd9a, OpenAPI 0.6.0-rc.1, blob f64bfe9a.
const token = 'synthetic-g6-contract-token';
const product = {
  product_id: 'contract-product-1', slug: 'zapatillas-contrato', name: 'Zapatillas contrato',
  categoria_id: 'running', tipo_producto_id: 'calzado', marca_id: 'brand-1',
  tiene_variantes: false, sku_base: 'SKU-CONTRACT-1',
};
type Reply = (req: IncomingMessage, res: ServerResponse) => void;

describe('CatalogModule -> real adapter -> local G6 contract HTTP server', () => {
  let app: INestApplication;
  let upstream: Server;
  let reply: Reply;
  let seen: IncomingMessage[];
  let timers: NodeJS.Timeout[];

  const json = (res: ServerResponse, body: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const page = (items: unknown[] = [product]) => ({ items, pagina: 1, tamanio: 24, total: items.length });

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      seen.push(req);
      // A static test credential proves header transport only, never JWT verification/grants.
      if (req.headers.authorization !== `Bearer ${token}`) return json(res, {}, 401);
      reply(req, res);
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const config = {
      NODE_ENV: 'test', CATALOG_SOURCE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
      PRODUCTOS_BASE_URL: `http://127.0.0.1:${address.port}`, PRODUCTOS_SERVICE_TOKEN: token,
      PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
      PRODUCTOS_MEDIA_HOSTS: 'images.example', PRODUCTOS_TIMEOUT_MS: '500',
    };
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true, load: [() => config] }),
      CatalogModule,
    ] }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    seen = [];
    timers = [];
    reply = (_req, res) => json(res, page());
  });
  afterEach(() => {
    timers.forEach(clearTimeout);
    jest.restoreAllMocks();
  });
  afterAll(async () => {
    await app?.close();
    upstream?.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it('reads categories using the technical token and correlates BFF response with upstream', async () => {
    reply = (_req, res) => json(res, { categories: [
      { categoria_id: 'running', name: 'Running', status: 'ACTIVA' },
      { categoria_id: 'private', name: 'Oculta', status: 'INACTIVA' },
    ] });
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/home')
      .set('Authorization', 'Bearer unrelated-browser-token').expect(200);
    expect(result.body).toEqual({ categories: [{ categoryId: 'running', name: 'Running' }], featuredProducts: [] });
    expect(result.headers['x-catalog-source']).toBe('REAL');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(seen[0].url).toBe('/api/v1/categorias');
    expect(seen[0].headers.authorization).toBe(`Bearer ${token}`);
    expect(seen[0].headers['x-correlation-id']).toBe(result.headers['x-request-id']);
    expect(JSON.stringify(result.body)).not.toContain(token);
  });

  it('maps the second page, category and name order over HTTP without exposing upstream-only fields', async () => {
    reply = (_req, res) => json(res, { ...page(), pagina: 2, tamanio: 1, total: 2 });
    const result = await request(app.getHttpServer())
      .get('/api/v1/catalog/products?q=zapatillas&page=1&pageSize=1&categoryIds=running&sort=NAME_DESC').expect(200);
    const url = new URL(seen[0].url!, 'http://fixture');
    expect(url.pathname).toBe('/api/v1/productos');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      canal: 'MARKETPLACE', q: 'zapatillas', pagina: '2', tamanio: '1', categoriaId: 'running', orden: 'NOMBRE_DESC',
    });
    expect(result.body.page).toEqual({ number: 1, size: 1, totalElements: 2, totalPages: 2 });
    expect(result.body.data[0]).toEqual({
      productId: product.product_id, slug: product.slug, name: product.name,
      categoryId: product.categoria_id, brandId: product.marca_id, image: null,
    });
    expect(seen[0].headers['x-correlation-id']).toBe(result.headers['x-request-id']);
  });

  it('preserves both omitted/empty images and an approved image in the same HTTP page', async () => {
    reply = (_req, res) => json(res, page([
      product, { ...product, product_id: 'empty', images: [] },
      { ...product, product_id: 'image', images: ['https://images.example/product.jpg'] },
    ]));
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products').expect(200);
    expect(result.body.data.map((p: { image: unknown }) => p.image)).toEqual([
      null, null, { url: 'https://images.example/product.jpg', alt: product.name },
    ]);
    expect(result.body.page.totalElements).toBe(3);
  });

  it('runs the standalone probe CLI against the HTTP BFF without a G6 token in its environment', async () => {
    reply = (req, res) => req.url === '/api/v1/categorias' ?
      json(res, { categories: [{ categoria_id: 'running', name: 'Running', status: 'ACTIVA' }] }) :
      json(res, { ...page(), tamanio: 4 });
    const { stdout } = await promisify(execFile)(process.execPath, [
      resolve('scripts/check-g6.mjs'), '--base-url', await app.getUrl(),
    ], { windowsHide: true, timeout: 15000, env: {
      SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP,
    } });
    const report = JSON.parse(stdout);
    expect(report).toMatchObject({ status: 'PASS_READS', source: 'REAL', productsOnPage: 1 });
    expect(report.correlationIds).toHaveLength(3);
    expect(seen).toHaveLength(2); // Invalid query is rejected before reaching upstream.
    expect(stdout).not.toContain(token);
  });

  it('keeps a successful empty result separate from a technical failure', async () => {
    reply = (_req, res) => json(res, page([]));
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=sin-coincidencias').expect(200);
    expect(result.body).toEqual({ sort: null, data: [], page: { number: 0, size: 24, totalElements: 0, totalPages: 0 } });
    expect(result.headers['x-catalog-source']).toBe('REAL');
  });

  it.each([401, 403, 429, 503])('maps upstream %s to safe correlated 503 without returning a mock page', async (status) => {
    reply = (_req, res) => json(res, { code: 'PRIVATE_PROVIDER_ERROR', detail: token }, status);
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products').expect(503);
    expect(result.headers['content-type']).toContain('application/problem+json');
    expect(result.body).toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503, requestId: result.headers['x-request-id'] });
    expect(result.body.data).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toMatch(/synthetic-g6|PRIVATE_PROVIDER/);
    expect(seen).toHaveLength(1);
  });

  it('handles the current Caddy-style unavailable response without treating it as a catalog', async () => {
    reply = (_req, res) => { res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('API Gateway pending'); };
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(503);
    expect(result.body.code).toBe('CATALOG_UNAVAILABLE');
    expect(result.body.categories).toBeUndefined();
  });

  it('aborts a slow HTTP provider and returns a recoverable catalog error', async () => {
    reply = (_req, res) => { timers.push(setTimeout(() => json(res, page()), 1200)); };
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products').expect(503);
    expect(result.body.code).toBe('CATALOG_TIMEOUT');
    expect(seen).toHaveLength(1);
  });

  it('does not follow redirects or send the token to another route', async () => {
    reply = (_req, res) => { res.writeHead(302, { Location: '/must-not-receive-token' }); res.end(); };
    await request(app.getHttpServer()).get('/api/v1/catalog/products').expect(503);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).not.toContain('must-not-receive-token');
  });

  it('rejects invalid input before contacting the HTTP provider', async () => {
    await request(app.getHttpServer()).get('/api/v1/catalog/products?q=x').expect(400);
    expect(seen).toHaveLength(0);
  });

  it('rejects unsafe images and never logs the technical token or raw query', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    reply = (_req, res) => json(res, page([{ ...product, images: ['https://unapproved.example/image.jpg'] }]));
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=private-query').expect(503);
    expect(JSON.stringify(result.body)).not.toContain('unapproved.example');
    expect(JSON.stringify([...log.mock.calls, ...warn.mock.calls])).not.toMatch(/synthetic-g6|private-query/);
  });
});
