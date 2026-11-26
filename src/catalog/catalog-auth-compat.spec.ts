import { createG6Client } from './g6-client';
import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from './provider';
import { realProductDetail } from './product-detail.real';
import { ProductDetailService } from './product-detail.service';

const id = 'a0000000-0000-4000-8000-000000000001';
const env = { NODE_ENV: 'production', CATALOG_SOURCE: 'real', BFF_MODE: 'real',
  CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_BASE_URL: 'https://g6.example',
  PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA,
  PRODUCTOS_MEDIA_HOSTS: 'images.example', PRODUCTOS_AUTH_MODE: 'client-credentials',
  G7_TOKEN_URL: 'https://g7.example/api/v1/auth/token', PRODUCTOS_CLIENT_SECRET: 'synthetic-client-secret',
  PRODUCTOS_SERVICE_TOKEN: 'synthetic-residual-static-token' };
const product = () => ({ product_id: id, slug: 'polo-real', name: 'Polo', marca_id: 'brand', categoria_id: 'cat',
  marca: { marca_id: 'brand', name: 'Marca' }, images: ['https://images.example/polo.png'], attributes: [] });
const issued = (token = 'synthetic-issued-token') => Response.json({ accessToken: token, tokenType: 'Bearer',
  expiresIn: 3600, scopes: ['catalogo:leer'] });

describe('shared G6 authentication for catalog and F011', () => {
  it.each(['public-read-only', 'service-token', 'client-credentials'])
  ('uses the selected %s production mode for REAL detail without visitor credentials', async mode => {
    const issuer = jest.fn(async () => issued());
    const fetcher = jest.fn(async (url: URL, options: RequestInit) => {
      if (url.origin === 'https://g7.example') return issuer();
      expect(url.href).toBe('https://g6.example/api/v1/productos/por-slug/polo-real?canal=MARKETPLACE');
      expect(options).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' });
      const headers = new Headers(options.headers);
      expect(headers.get('Authorization')).toBe(mode === 'public-read-only' ? null
        : mode === 'service-token' ? 'Bearer synthetic-residual-static-token' : 'Bearer synthetic-issued-token');
      expect(headers.has('Cookie')).toBe(false);
      expect(headers.get('X-Correlation-Id')).toBe(id);
      return Response.json(product());
    });
    const response = await realProductDetail('polo-real', { ...env, PRODUCTOS_AUTH_MODE: mode }, fetcher, id);
    expect(response.meta.source).toBe('REAL');
    expect(JSON.stringify(response)).not.toContain('synthetic-');
    expect(issuer).toHaveBeenCalledTimes(mode === 'client-credentials' ? 1 : 0);
  });

  it.each([
    { PRODUCTOS_AUTH_MODE: 'unknown' }, { PRODUCTOS_AUTH_MODE: 'demo-no-auth' },
    { G7_TOKEN_URL: 'http://g7.example/api/v1/auth/token' },
    { G7_TOKEN_URL: 'https://g7.example/other' }, { G7_TOKEN_URL: 'https://g7.example/api/v1/auth/token?aud=other' },
    { G7_TOKEN_URL: 'https://user:pass@g7.example/api/v1/auth/token' },
    { PRODUCTOS_CLIENT_SECRET: '' },
  ])('rejects the same invalid authentication configuration in both consumers: %j', override => {
    const fetcher = jest.fn(async () => issued());
    expect(() => createRealProvider({ ...env, ...override }, fetcher)).toThrow();
    expect(() => createG6Client({ ...env, ...override }, fetcher)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ignores invalid G7 configuration when public-read-only is explicitly selected', async () => {
    const fetcher = jest.fn(async (url: URL, options: RequestInit) => {
      expect(url.origin).toBe('https://g6.example');
      expect(new Headers(options.headers).has('Authorization')).toBe(false);
      return Response.json(product());
    });
    await expect(realProductDetail('polo-real', { ...env, PRODUCTOS_AUTH_MODE: 'public-read-only',
      G7_TOKEN_URL: 'not-an-issuer' }, fetcher)).resolves.toMatchObject({ meta: { source: 'REAL' } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('F011 service lifecycle and token caching', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => { Object.assign(process.env, env); });
  afterEach(() => { process.env = { ...originalEnv }; jest.restoreAllMocks(); });

  it('reuses its client for concurrent/sequential detail calls and renews the issued token', async () => {
    let now = 0, emissions = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const reads: string[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      const url = new URL(String(input));
      if (url.origin === 'https://g7.example') return issued(`synthetic-issued-${++emissions}`);
      reads.push(new Headers(options?.headers).get('Authorization')!);
      return Response.json(product());
    });
    const service = new ProductDetailService();
    await Promise.all([service.getBySlug('polo-real', id), service.getBySlug('polo-real', id)]);
    await service.getBySlug('polo-real', id);
    expect(emissions).toBe(1);
    now = 3_540_000;
    await service.getBySlug('polo-real', id);
    expect(emissions).toBe(2);
    expect(reads).toEqual(['Bearer synthetic-issued-1', 'Bearer synthetic-issued-1',
      'Bearer synthetic-issued-1', 'Bearer synthetic-issued-2']);
  });

  it('rebuilds its client on mode changes and never reuses an old token after invalid configuration', async () => {
    let emissions = 0;
    const auth: Array<string | null> = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
      if (new URL(String(input)).origin === 'https://g7.example') { emissions++; return issued(); }
      auth.push(new Headers(options?.headers).get('Authorization'));
      return Response.json(product());
    });
    const service = new ProductDetailService();
    await service.getBySlug('polo-real', id);
    process.env.PRODUCTOS_AUTH_MODE = 'public-read-only';
    await service.getBySlug('polo-real', id);
    expect(auth).toEqual(['Bearer synthetic-issued-token', null]);
    expect(emissions).toBe(1);
    process.env.PRODUCTOS_AUTH_MODE = 'client-credentials';
    delete process.env.PRODUCTOS_CLIENT_SECRET;
    await expect(service.getBySlug('polo-real', id)).rejects.toMatchObject({ status: 503 });
    expect(auth).toHaveLength(2);
  });

  it('keeps issuer rejection sanitized without using the residual static token or a fixture', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('synthetic-private-issuer-body', { status: 401 }));
    await expect(new ProductDetailService().getBySlug('polo-real', id))
      .rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe(env.G7_TOKEN_URL);
  });

  it('does not serve a known fixture when client-credentials has inconsistent REAL flags', async () => {
    process.env.BFF_MODE = 'mock';
    process.env.CATALOG_SOURCE = 'mock';
    const fetcher = jest.spyOn(globalThis, 'fetch');
    await expect(new ProductDetailService().getBySlug('polo-training', id)).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
