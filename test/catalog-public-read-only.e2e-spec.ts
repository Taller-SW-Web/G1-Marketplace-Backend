import { INestApplication, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CatalogModule } from '../src/catalog/catalog.module';
import { CONTRACT_SHA, CONTRACT_VERSION } from '../src/catalog/provider';

// Actual Nest configuration/provider/controller pipeline. Only the HTTPS G6 transport is simulated.
describe('CatalogModule production public-read-only', () => {
  let app: INestApplication;
  let transport: jest.SpyInstance;
  const id = 'a0000000-0000-4000-8000-000000000001';
  const product = { product_id: id, name: 'Polo', categoria_id: 'cat', marca_id: 'brand', slug: 'polo', status: 'ACTIVO' };

  beforeAll(async () => {
    transport = jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input));
      if (url.pathname === '/api/v1/categorias') return Response.json({
        categories: [{ categoria_id: 'cat', name: 'Ropa', status: 'ACTIVA' }],
      });
      if (url.pathname === '/api/v1/marcas') return Response.json({
        brands: [{ marca_id: 'brand', name: 'Marca', status: 'ACTIVA' }],
      });
      if (url.pathname === `/api/v1/productos/${id}`) return Response.json(product);
      return Response.json({ items: [product], total: 1, pagina: 1, tamanio: 24 });
    });
    const config = {
      NODE_ENV: 'production', CATALOG_SOURCE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
      PRODUCTOS_TIMEOUT_MS: '100', PRODUCTOS_AUTH_MODE: 'public-read-only', PRODUCTOS_BASE_URL: 'https://g6.synthetic.example',
      PRODUCTOS_SERVICE_TOKEN: 'synthetic-stale-server-token',
      PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
      CATALOG_FEATURED_ENABLED: 'true', CATALOG_FEATURED_APPROVED: 'true', CATALOG_FEATURED_IDS: id,
    };
    const module = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, ignoreEnvVars: true, load: [() => config] }),
      CatalogModule,
    ] }).compile();
    app = module.createNestApplication({ logger: false });
    await app.init();
  });
  beforeEach(() => transport.mockClear());
  afterAll(async () => { await app?.close(); jest.restoreAllMocks(); });

  it.each([
    ['/api/v1/catalog/home', 2], ['/api/v1/catalog/filters', 2], ['/api/v1/catalog/products?q=polo', 1],
  ])('serves %s without forwarding server or visitor credentials', async (path, count) => {
    const result = await request(app.getHttpServer()).get(path)
      .set('Authorization', 'Bearer synthetic-visitor-token').set('Cookie', 'session=synthetic-private-cookie').expect(200);
    expect(result.headers['x-catalog-source']).toBe('REAL');
    expect(transport).toHaveBeenCalledTimes(count);
    for (const [input, options] of transport.mock.calls) {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://g6.synthetic.example');
      expect(options).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' });
      const headers = new Headers(options.headers);
      expect(headers.has('Authorization')).toBe(false);
      expect(headers.has('Cookie')).toBe(false);
      expect(headers.get('X-Correlation-Id')).toBe(result.headers['x-request-id']);
      if (url.pathname.startsWith('/api/v1/productos')) expect(url.searchParams.get('canal')).toBe('MARKETPLACE');
    }
    expect(JSON.stringify(result.body)).not.toContain('synthetic-');
  });

  it('rejects mutation methods and unsupported parameters before any upstream call', async () => {
    await request(app.getHttpServer()).post('/api/v1/catalog/products').send({ name: 'Mutation' }).expect(405);
    await request(app.getHttpServer()).get('/api/v1/catalog/products?includeInactive=true').expect(400);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/v1/catalog/home', 'CATALOG_UNAVAILABLE'],
    ['/api/v1/catalog/filters', 'CATALOG_UNAVAILABLE'],
    ['/api/v1/catalog/products?q=polo&page=0', 'CATALOG_UNAVAILABLE'],
    ['/api/v1/catalog/products?q=polo&page=0', 'CATALOG_TIMEOUT'],
  ])('publishes a safe problem from %s when G6 causes %s and recovers on the next read', async (path, code) => {
    if (code === 'CATALOG_TIMEOUT') {
      transport.mockImplementationOnce((_input, options: RequestInit) => new Promise((_resolve, reject) => {
        const signal = options.signal!;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }));
    } else {
      transport.mockResolvedValueOnce(new Response('private upstream detail', { status: 503 }));
    }

    const failed = await request(app.getHttpServer()).get(path).expect(503);
    expect(failed.body).toMatchObject({ code, requestId: failed.headers['x-request-id'] });
    expect(failed.headers['x-catalog-source']).toBe('REAL');
    expect(failed.body.data).toBeUndefined();
    expect(JSON.stringify(failed.body)).not.toContain('private upstream detail');
    const sent = new Headers(transport.mock.calls[0][1].headers);
    expect(sent.get('x-correlation-id')).toBe(failed.headers['x-request-id']);
    const recovered = await request(app.getHttpServer()).get(path).expect(200);
    expect(recovered.headers['x-request-id']).not.toBe(failed.headers['x-request-id']);
    expect(recovered.headers['x-catalog-source']).toBe('REAL');
  });

  it('keeps a real upstream authorization failure correlated and unavailable', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    transport.mockResolvedValueOnce(new Response('private upstream rejection', { status: 401 }));
    const result = await request(app.getHttpServer()).get('/api/v1/catalog/products').expect(503);
    expect(result.body).toMatchObject({ code: 'CATALOG_UNAVAILABLE', requestId: result.headers['x-request-id'] });
    expect(result.headers['x-catalog-source']).toBe('REAL');
    expect(result.body.data).toBeUndefined();
    expect(JSON.stringify(result.body)).not.toContain('private upstream');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
