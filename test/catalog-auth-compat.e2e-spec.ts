import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../src/catalog/catalog.module';
import { ProductDetailModule } from '../src/catalog/product-detail.module';
import { CONTRACT_SHA, CONTRACT_VERSION } from '../src/catalog/provider';
import { requestIdMiddleware } from '../src/http/request-id.middleware';

// Two distinct HTTP origins: token issuer and catalog. No external service or credential is used.
describe.each(['public-read-only', 'service-token', 'client-credentials'])('catalog/F011 HTTP compatibility: %s', authMode => {
  const originalEnv = { ...process.env };
  let app: INestApplication;
  let issuer: Server, upstream: Server, issuerUrl: string, catalogUrl: string;
  let rejectIssuer = false, rejectCatalog = false;
  let tokens: Array<{ method?: string; form: URLSearchParams; auth?: string; cookie?: string }>;
  let reads: Array<{ method?: string; path?: string; auth?: string; cookie?: string }>;
  const product = { product_id: 'a0000000-0000-4000-8000-000000000001', name: 'Polo real', slug: 'polo-real',
    categoria_id: 'cat', marca_id: 'brand', marca: { marca_id: 'brand', name: 'Marca' },
    images: ['https://images.example/polo.png'], attributes: [] };
  async function start(server: Server) {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port');
    return `http://127.0.0.1:${address.port}`;
  }
  beforeAll(async () => {
    issuer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (b: Buffer) => chunks.push(b));
      req.on('end', () => {
        tokens.push({ method: req.method, form: new URLSearchParams(Buffer.concat(chunks).toString()),
          auth: req.headers.authorization, cookie: req.headers.cookie });
        res.writeHead(rejectIssuer ? 401 : 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rejectIssuer ? { detail: 'synthetic-private-issuer-error' }
          : { accessToken: 'synthetic-issued-http-token', tokenType: 'Bearer', expiresIn: 3600, scopes: ['catalogo:leer'] }));
      });
    });
    upstream = createServer((req, res) => {
      reads.push({ method: req.method, path: req.url, auth: req.headers.authorization, cookie: req.headers.cookie });
      res.writeHead(rejectCatalog ? 401 : 200, { 'Content-Type': 'application/json' });
      if (rejectCatalog) { res.end(JSON.stringify({ detail: 'synthetic-private-provider-error' })); return; }
      const url = new URL(req.url!, 'http://fixture');
      const payload = url.pathname === '/api/v1/categorias' ? { categories: [] }
        : url.pathname === '/api/v1/marcas' ? { brands: [] }
        : url.pathname.startsWith('/api/v1/productos/por-slug/') ? product
        : { items: [product], total: 1, pagina: 1, tamanio: 24 };
      res.end(JSON.stringify(payload));
    });
    issuerUrl = await start(issuer); catalogUrl = await start(upstream);
  });
  beforeEach(async () => {
    tokens = []; reads = []; rejectIssuer = false; rejectCatalog = false;
    const env = { NODE_ENV: 'test', CATALOG_SOURCE: 'real', BFF_MODE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
      PRODUCTOS_AUTH_MODE: authMode, PRODUCTOS_BASE_URL: catalogUrl,
      G7_TOKEN_URL: issuerUrl + '/api/v1/auth/token', PRODUCTOS_CLIENT_SECRET: 'synthetic-http-client-secret',
      PRODUCTOS_SERVICE_TOKEN: 'synthetic-static-http-token', PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION,
      PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA, PRODUCTOS_MEDIA_HOSTS: 'images.example' };
    Object.assign(process.env, env);
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true, load: [() => env] }),
      CatalogModule, ProductDetailModule,
    ] }).compile();
    app = module.createNestApplication({ logger: false }); app.use(requestIdMiddleware); await app.init();
  });
  afterEach(async () => { await app?.close(); process.env = { ...originalEnv }; });
  afterAll(async () => {
    for (const server of [issuer, upstream]) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it('serves all reads and reuses the detail token without forwarding visitor identity', async () => {
    for (const path of ['home', 'filters', 'products', 'products/polo-real']) {
      const response = await request(app.getHttpServer()).get('/api/v1/catalog/' + path)
        .set('Authorization', 'Bearer synthetic-visitor-token').set('Cookie', 'visitor=synthetic-private-cookie').expect(200);
      expect(response.headers['x-catalog-source']).toBe('REAL');
      expect(JSON.stringify(response.body)).not.toContain('synthetic-');
    }
    const emissions = tokens.length;
    await Promise.all([request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real').expect(200),
      request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real').expect(200)]);
    expect(tokens).toHaveLength(emissions);
    expect(emissions).toBe(authMode === 'client-credentials' ? 2 : 0);
    for (const read of reads) {
      expect(read.method).toBe('GET'); expect(read.cookie).toBeUndefined();
      expect(read.auth).toBe(authMode === 'public-read-only' ? undefined
        : authMode === 'service-token' ? 'Bearer synthetic-static-http-token' : 'Bearer synthetic-issued-http-token');
      if (read.path?.startsWith('/api/v1/productos')) expect(new URL(read.path, catalogUrl).searchParams.get('canal')).toBe('MARKETPLACE');
    }
    for (const token of tokens) {
      expect(token.method).toBe('POST'); expect(token.auth).toBeUndefined(); expect(token.cookie).toBeUndefined();
      expect(Object.fromEntries(token.form)).toEqual({ grant_type: 'client_credentials', client_id: 'modulo-marketplace',
        client_secret: 'synthetic-http-client-secret', scope: 'catalogo:leer' });
    }
  });
  it('returns a safe correlated detail failure without retrying another authentication mode', async () => {
    rejectCatalog = true;
    const response = await request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real').expect(503);
    expect(response.body).toMatchObject({ code: 'PRODUCT_CATALOG_UNAVAILABLE', requestId: response.headers['x-request-id'] });
    expect(response.body.data).toBeUndefined(); expect(JSON.stringify(response.body)).not.toContain('synthetic-private');
    expect(reads).toHaveLength(1); expect(tokens).toHaveLength(authMode === 'client-credentials' ? 1 : 0);
  });
  if (authMode === 'client-credentials') {
    it('fails before reaching G6 when G7 rejects issuance, despite a residual static token', async () => {
      rejectIssuer = true;
      const response = await request(app.getHttpServer()).get('/api/v1/catalog/products/polo-real').expect(503);
      expect(response.body.code).toBe('PRODUCT_CATALOG_UNAVAILABLE'); expect(response.body.data).toBeUndefined();
      expect(tokens).toHaveLength(1); expect(reads).toHaveLength(0);
      expect(JSON.stringify(response.body)).not.toContain('synthetic-private');
    });
  }
});
