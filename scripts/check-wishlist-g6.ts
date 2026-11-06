import { ConfigService } from '@nestjs/config';
import { RealWishlistCatalog, WISHLIST_G6_REVISION } from '../src/catalog/real-wishlist-catalog';

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error('INVALID_ARGUMENTS');
  return value;
}

async function main(): Promise<void> {
  const base = new URL(argument('--base-url'));
  const productId = argument('--product-id');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('INVALID_BASE_URL');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
    throw new Error('INVALID_PRODUCT_ID');
  }
  const values: Record<string, string> = {
    NODE_ENV: 'production', PRODUCTOS_BASE_URL: base.href, PRODUCTOS_AUTH_MODE: 'public-read-only',
    PRODUCTOS_TIMEOUT_MS: '5000', WISHLIST_G6_APPROVED: 'true', WISHLIST_G6_REVISION,
  };
  const catalog = new RealWishlistCatalog({ get: (key: string, fallback?: unknown) => values[key] ?? fallback } as ConfigService);
  const active = await catalog.isActive(productId);
  const sku = active ? await catalog.resolveSku(productId) : null;
  console.log(JSON.stringify({ status: active ? 'PASS' : 'PRODUCT_NOT_AVAILABLE', productId, sku,
    authMode: 'public-read-only', authorizationSent: false, scope: 'F-036/F-038 catalog eligibility only' }, null, 2));
}

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'PROBE_FAILED';
  console.error(JSON.stringify({ status: 'FAIL', code }));
  process.exitCode = 1;
});
