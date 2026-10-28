import { ConfigService } from '@nestjs/config';
import { once } from 'node:events';
import { createServer, Server } from 'node:http';
import { RealWishlistCatalog, WISHLIST_G6_REVISION } from '../src/catalog/real-wishlist-catalog';

describe('Wishlist G6 adapter -> local HTTP contract fixture (not external REAL evidence)', () => {
  let server: Server;
  let catalog: RealWishlistCatalog;
  let seen: { method?: string; url?: string; auth?: string; body?: unknown }[];
  let missing: boolean;
  let down: boolean;
  let hang: boolean;
  let stock: string;
  let quantity: string;
  const product = { product_id: 'P1', name: 'Producto', slug: 'producto', marca: { name: 'Marca' },
    tiene_variantes: false, sku_base: 'SKU1', variants: [] };
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : undefined;
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      if (hang) return;
      res.setHeader('Content-Type', 'application/json');
      if (down) { res.writeHead(503); return res.end(JSON.stringify({ detail: 'private-error' })); }
      if (req.url?.startsWith('/api/v1/productos/')) {
        if (missing) { res.writeHead(404); return res.end('{}'); }
        return res.end(JSON.stringify(product));
      }
      if (req.url?.startsWith('/api/v1/precios/')) return res.end(JSON.stringify({ sku: 'SKU1', currency: 'PEN',
        precio_regular: 120, precio_oferta: null, price_version: 2, channel_id: null,
        valid_from: '2026-01-01T00:00:00Z', vigencia_id: 'v1', origen: 'PRODUCTO' }));
      if (req.url?.endsWith('/verificar')) return res.end(JSON.stringify({ binding: false,
        evaluated_at: new Date().toISOString(), items: [{ sku: 'SKU1', requested_quantity: body.lines[0].quantity, result: quantity }] }));
      if (req.url?.startsWith('/api/v1/inventario/disponibilidad/comercial?')) {
        return res.end(JSON.stringify({ items: [{ sku: 'SKU1', status: stock }] }));
      }
      res.writeHead(404); res.end('{}');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Port');
    const config: Record<string, unknown> = { NODE_ENV: 'test', WISHLIST_G6_APPROVED: 'true',
      WISHLIST_G6_REVISION: WISHLIST_G6_REVISION, PRODUCTOS_BASE_URL: `http://127.0.0.1:${address.port}`,
      PRODUCTOS_SERVICE_TOKEN: 'fixture-technical-token', PRODUCTOS_TIMEOUT_MS: 100,
      WISHLIST_G6_QUANTITY_APPROVED: 'true', WISHLIST_FULFILLMENT_REF: 'approved-channel-reference' };
    catalog = new RealWishlistCatalog({ get: (key: string, fallback?: unknown) => config[key] ?? fallback } as ConfigService);
  });
  beforeEach(() => { seen = []; missing = false; down = false; hang = false; stock = 'DISPONIBLE'; quantity = 'SUFICIENTE'; });
  afterAll(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  it('reads detail, commercial availability and price through the pinned routes', async () => {
    await expect(catalog.isActive('P1')).resolves.toBe(true);
    await expect(catalog.resolveSku('P1')).resolves.toBe('SKU1');
    await expect(catalog.project('P1')).resolves.toMatchObject({ name: 'Producto', availability: 'AVAILABLE', price: { amount: 120, currency: 'PEN' } });
    expect(seen.every(call => call.auth === 'Bearer fixture-technical-token')).toBe(true);
    expect(seen.some(call => call.url === '/api/v1/productos/P1?canal=MARKETPLACE')).toBe(true);
  });
  it('sends total quantity with explicit fulfillment, never reserves or mutates inventory', async () => {
    await expect(catalog.quote('SKU1', 4)).resolves.toMatchObject({ amount: 120, version: 2 });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/v1/inventario/disponibilidad/comercial/verificar', body: {
      channel_id: 'MARKETPLACE', fulfillment: { mode: 'ENVIO_DOMICILIO', fulfillment_ref: 'approved-channel-reference' },
      lines: [{ sku: 'SKU1', quantity: 4 }] } });
    quantity = 'INSUFICIENTE'; await expect(catalog.quote('SKU1', 4)).rejects.toMatchObject({ status: 409 });
    quantity = 'INDETERMINADO'; await expect(catalog.quote('SKU1', 4)).rejects.toMatchObject({ status: 503 });
  });
  it('distinguishes removed, out of stock and unknown data from service failures', async () => {
    missing = true; await expect(catalog.project('P1')).resolves.toMatchObject({ availability: 'UNAVAILABLE' });
    missing = false; stock = 'AGOTADO'; await expect(catalog.project('P1')).resolves.toMatchObject({ availability: 'OUT_OF_STOCK' });
    stock = 'INDETERMINADO'; await expect(catalog.project('P1')).rejects.toMatchObject({ status: 503 });
    down = true; await expect(catalog.isActive('P1')).rejects.toMatchObject({ status: 503 });
  });
  it('bounds a provider timeout without retries or exposing response details', async () => {
    hang = true; await expect(catalog.project('P1')).rejects.toMatchObject({ status: 503,
      response: { code: 'CATALOG_UNAVAILABLE', message: 'Catálogo no disponible' } });
    expect(seen).toHaveLength(1);
  });
});
