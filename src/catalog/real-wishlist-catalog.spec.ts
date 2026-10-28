import { ConfigService } from '@nestjs/config';
import { RealWishlistCatalog, WISHLIST_G6_REVISION } from './real-wishlist-catalog';

describe('G6 wishlist projection and quantity contract (simulated HTTP)', () => {
  const original = global.fetch;
  let reply: jest.Mock;
  let config: Record<string, unknown>;
  let catalog: RealWishlistCatalog;
  const product = { product_id: 'P1', name: 'Producto', slug: 'producto', tiene_variantes: false,
    sku_base: 'SKU1', marca: { name: 'Marca' }, variants: [], images: [] };
  const price = { sku: 'SKU1', precio_regular: 100, precio_oferta: 80, currency: 'PEN', price_version: 4,
    channel_id: 'MARKETPLACE', valid_from: '2026-01-01T00:00:00Z', valid_until: null, vigencia_id: 'v1', origen: 'PRODUCTO' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  beforeEach(() => {
    config = { NODE_ENV: 'test', WISHLIST_G6_APPROVED: 'true', WISHLIST_G6_REVISION: WISHLIST_G6_REVISION,
      WISHLIST_G6_QUANTITY_APPROVED: 'true', WISHLIST_FULFILLMENT_REF: 'channel-reference',
      PRODUCTOS_BASE_URL: 'http://127.0.0.1:4050', PRODUCTOS_SERVICE_TOKEN: 'synthetic-service-token' };
    catalog = new RealWishlistCatalog({ get: (key: string, fallback?: unknown) => config[key] ?? fallback } as ConfigService);
    reply = jest.fn(async (url: URL) => {
      if (url.pathname.includes('/productos/')) return json(product);
      if (url.pathname.includes('/precios/')) return json(price);
      if (url.pathname.endsWith('/verificar')) return json({ binding: false, evaluated_at: new Date().toISOString(),
        items: [{ sku: 'SKU1', requested_quantity: 3, result: 'SUFICIENTE' }] });
      return json({ items: [{ sku: 'SKU1', status: 'DISPONIBLE' }] });
    });
    global.fetch = reply;
  });
  afterEach(() => { global.fetch = original; });
  it('projects authoritative price and brand, transports only the technical credential', async () => {
    await expect(catalog.project('P1')).resolves.toEqual({ name: 'Producto', slug: 'producto', brand: 'Marca',
      image: null, price: { amount: 80, currency: 'PEN' }, availability: 'AVAILABLE' });
    for (const [, options] of reply.mock.calls) expect(options).toMatchObject({ redirect: 'error',
      headers: { Authorization: 'Bearer synthetic-service-token' } });
  });
  it('keeps removed products distinct from provider failures', async () => {
    reply.mockResolvedValueOnce(json({}, 404));
    await expect(catalog.project('P1')).resolves.toMatchObject({ availability: 'UNAVAILABLE', name: null });
    reply.mockResolvedValueOnce(json({}, 503));
    await expect(catalog.project('P1')).rejects.toMatchObject({ status: 503 });
    reply.mockRejectedValueOnce(new Error('upstream secret'));
    await expect(catalog.project('P1')).rejects.toMatchObject({ response: { code: 'CATALOG_UNAVAILABLE' } });
  });
  it('does not select a variant and rejects malicious redirect slugs', async () => {
    reply.mockResolvedValueOnce(json({ ...product, tiene_variantes: true }));
    await expect(catalog.resolveSku('P1')).rejects.toMatchObject({ status: 422, response: { redirectUrl: '/productos/producto' } });
    reply.mockResolvedValueOnce(json({ ...product, slug: '//evil.test' }));
    await expect(catalog.resolveSku('P1')).rejects.toMatchObject({ status: 503 });
  });
  it('verifies accumulated quantity and fails closed on insufficient/indeterminate/mismatched data', async () => {
    await expect(catalog.quote('SKU1', 3)).resolves.toEqual({ amount: 80, currency: 'PEN', version: 4 });
    expect(JSON.parse(reply.mock.calls[0][1].body)).toEqual({ channel_id: 'MARKETPLACE',
      fulfillment: { mode: 'ENVIO_DOMICILIO', fulfillment_ref: 'channel-reference' }, lines: [{ sku: 'SKU1', quantity: 3 }] });
    for (const [result, status] of [['INSUFICIENTE', 409], ['INDETERMINADO', 503]]) {
      reply.mockResolvedValueOnce(json({ binding: false, evaluated_at: new Date().toISOString(),
        items: [{ sku: 'SKU1', requested_quantity: 3, result }] }));
      await expect(catalog.quote('SKU1', 3)).rejects.toMatchObject({ status });
    }
    reply.mockResolvedValueOnce(json({ binding: false, evaluated_at: new Date().toISOString(),
      items: [{ sku: 'OTHER', requested_quantity: 3, result: 'SUFICIENTE' }] }));
    await expect(catalog.quote('SKU1', 3)).rejects.toMatchObject({ status: 503 });
  });
  it('rejects stale prices, unknown stock and disallowed media', async () => {
    reply.mockImplementationOnce(async () => json({ ...product, images: ['https://evil.test/image.png'] }));
    await expect(catalog.project('P1')).rejects.toBeDefined();
    reply.mockImplementation(async (url: URL) => url.pathname.includes('/productos/') ? json(product)
      : url.pathname.includes('/precios/') ? json({ ...price, valid_until: '2026-01-02T00:00:00Z' })
      : json({ items: [{ sku: 'SKU1', status: 'DISPONIBLE' }] }));
    await expect(catalog.project('P1')).rejects.toMatchObject({ status: 503 });
  });
  it('requires independent approvals, pin and service credential; no mock fallback', async () => {
    for (const key of ['WISHLIST_G6_APPROVED', 'WISHLIST_G6_REVISION', 'PRODUCTOS_SERVICE_TOKEN']) {
      const value = config[key]; config[key] = '';
      await expect(catalog.isActive('P1')).rejects.toMatchObject({ status: 503 }); config[key] = value;
    }
    expect(reply).not.toHaveBeenCalled();
    config.WISHLIST_G6_QUANTITY_APPROVED = 'false';
    await expect(catalog.quote('SKU1', 1)).rejects.toMatchObject({ status: 503 });
  });
});
