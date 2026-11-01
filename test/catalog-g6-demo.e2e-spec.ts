import { INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { createServer, IncomingMessage, Server } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import request from 'supertest';
import { CatalogModule } from '../src/catalog/catalog.module';
import { CONTRACT_SHA, CONTRACT_VERSION } from '../src/catalog/provider';

// Local HTTP server reproduces G6's partial demo. Public-provider evidence is recorded separately.
describe('CatalogModule with explicit G6 demo-no-auth configuration', () => {
  let app: INestApplication;
  let upstream: Server;
  let seen: IncomingMessage[] = [];

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      seen.push(req);
      if (req.url === '/api/v1/categorias') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ categories: [{ categoria_id: 'demo-category', name: 'Calzado', status: 'ACTIVA' }] }));
      } else {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('API Gateway pending');
      }
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Missing test port');
    const config = {
      NODE_ENV: 'test', CATALOG_SOURCE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
      PRODUCTOS_AUTH_MODE: 'demo-no-auth', PRODUCTOS_BASE_URL: `http://127.0.0.1:${address.port}`,
      PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
    };
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true, load: [() => config] }),
      CatalogModule,
    ] }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
  });
  beforeEach(() => { seen = []; });
  afterEach(() => { jest.restoreAllMocks(); });
  afterAll(async () => {
    await app?.close();
    upstream?.closeAllConnections();
    await new Promise<void>((done) => upstream.close(() => done()));
  });

  it('reads categories without a configured service token and never forwards browser Authorization', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/home')
      .set('Authorization', 'Bearer unrelated-browser-token').expect(200);
    expect(result.headers['x-catalog-source']).toBe('REAL');
    expect(result.body).toEqual({ categories: [{ categoryId: 'demo-category', name: 'Calzado' }], featuredProducts: [] });
    expect(seen[0].headers.authorization).toBeUndefined();
    expect(seen[0].headers['x-correlation-id']).toBe(result.headers['x-request-id']);
  });

  it('preserves the provider failure as correlated 503 rather than returning an empty or mock catalog', async () => {
    const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products?q=zapatillas').expect(503);
    expect(result.headers['x-catalog-source']).toBe('REAL');
    expect(result.body).toMatchObject({ code: 'CATALOG_UNAVAILABLE', status: 503, requestId: result.headers['x-request-id'] });
    expect(result.body.data).toBeUndefined();
    expect(seen[0].url).toContain('/api/v1/productos?');
    expect(seen[0].headers.authorization).toBeUndefined();
    expect(seen[0].headers['x-correlation-id']).toBe(result.headers['x-request-id']);
    expect(warning.mock.calls.some(([line]) => String(line).includes('PROVIDER_HTTP_503'))).toBe(true);
  });

  it('runs the categories-only CLI successfully while the provider products route is unavailable', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [
      resolve('scripts/check-g6.mjs'), '--home-only', '--base-url', await app.getUrl(),
    ], { windowsHide: true, timeout: 15000, env: {
      SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP,
    } });
    expect(JSON.parse(stdout)).toMatchObject({ status: 'PASS_CATEGORIES', source: 'REAL', categories: 1 });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('/api/v1/categorias');
  });
});
