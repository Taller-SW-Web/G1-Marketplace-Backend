import { ConfigService } from '@nestjs/config';
import { SandboxWishlistCatalog } from './wishlist-catalog';

describe('Sandbox wishlist catalog boundaries', () => {
  const catalog = (enabled = true, environment = 'test') => new SandboxWishlistCatalog({
    get: (name: string, fallback: unknown) => ({ H3_SANDBOX_ENABLED: enabled, NODE_ENV: environment } as Record<string, unknown>)[name] ?? fallback,
  } as ConfigService);

  it('keeps unavailable products distinct from catalog failures, including inherited property names', async () => {
    for (const id of ['PRD-RETIRED', '__proto__', 'toString']) {
      await expect(catalog().project(id)).resolves.toMatchObject({ availability: 'UNAVAILABLE', name: null });
    }
    await expect(catalog().project('PRD-UNAVAILABLE')).rejects.toMatchObject({ status: 503 });
  });
  it('refuses sandbox catalog use when disabled or in production', async () => {
    await expect(catalog(false).project('PRD-1')).rejects.toMatchObject({ status: 503 });
    await expect(catalog(true, 'production').project('PRD-1')).rejects.toMatchObject({ status: 503 });
  });
  it('does not derive SKU from product ID or choose an arbitrary variant', async () => {
    await expect(catalog().resolveSku('PRD-1')).resolves.toBe('SKU-SIMPLE');
    await expect(catalog().resolveSku('PRD-VARIANT')).rejects.toMatchObject({ status: 422,
      response: { redirectUrl: '/productos/producto-con-variantes' } });
  });
  it('requires valid commerce data and verifies total quantity rather than a commercial status alone', async () => {
    await expect(catalog().quote('SKU-SIMPLE', 10)).resolves.toMatchObject({ amount: 89.9, currency: 'PEN', version: 1 });
    await expect(catalog().quote('SKU-SIMPLE', 11)).rejects.toMatchObject({ status: 409 });
    await expect(catalog().quote('SKU-COMMERCE-UNAVAILABLE', 1)).rejects.toMatchObject({ status: 503 });
  });
});
