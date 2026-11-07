/**
 * Guarda de origen de datos (REAL/MOCK).
 *
 * Regresión: con `CATALOG_SOURCE=real` y `BFF_MODE=mock` la cabecera
 * `X-Catalog-Source` anunciaba REAL mientras F-012/F-014/F-015 servían
 * fixtures. La selección REAL debe fallar cerrado, nunca publicar datos de
 * demostración como del proveedor.
 */

import { isRealCatalogSource } from './catalog-mode';
import { catalogSource } from './catalog-source.interceptor';
import { ProductPriceService } from './product-price.service';
import { ProductAvailabilityService } from './product-availability.service';
import { ProductRecommendationsService } from './product-recommendations.service';
import { PRICE_ERROR_CODES } from './product-price.errors';
import { AVAILABILITY_ERROR_CODES } from './product-availability.errors';

const ENV_KEYS = [
  'CATALOG_SOURCE',
  'BFF_MODE',
  'PRODUCTOS_AUTH_MODE',
] as const;

const SLUG = 'producto-demostracion-1';

describe('isRealCatalogSource', () => {
  it.each([
    [{ CATALOG_SOURCE: 'real', BFF_MODE: 'mock' }, true],
    [{ CATALOG_SOURCE: 'real', BFF_MODE: 'real' }, true],
    [{ BFF_MODE: 'real' }, true],
    [{ PRODUCTOS_AUTH_MODE: 'public-read-only' }, true],
    [{ PRODUCTOS_AUTH_MODE: 'client-credentials' }, true],
    [{ CATALOG_SOURCE: 'mock', BFF_MODE: 'mock' }, false],
    [{ BFF_MODE: 'mock' }, false],
    [{}, false],
  ] as const)('%o → %s', (env, expected) => {
    expect(isRealCatalogSource(env)).toBe(expected);
  });
});

describe('guarda REAL/MOCK en los servicios comerciales', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('una configuración mixta falla cerrado y no publica fixtures como REAL', async () => {
    process.env.CATALOG_SOURCE = 'real';
    process.env.BFF_MODE = 'mock';
    delete process.env.PRODUCTOS_AUTH_MODE;

    // La cabecera y los servicios deben coincidir: ambos dicen REAL.
    expect(catalogSource()).toBe('REAL');

    await expect(new ProductPriceService().getPrice(SLUG)).rejects.toMatchObject({
      status: 503,
      response: { error: { code: PRICE_ERROR_CODES.PRICING_UNAVAILABLE } },
    });

    await expect(
      new ProductAvailabilityService().getAvailability(SLUG),
    ).rejects.toMatchObject({
      status: 503,
      response: {
        error: { code: AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE },
      },
    });

    const recommendations =
      await new ProductRecommendationsService().getRecommendations(SLUG);
    expect(recommendations.data).toEqual([]);
  });

  it('MOCK/MOCK sigue sirviendo fixtures', async () => {
    process.env.CATALOG_SOURCE = 'mock';
    process.env.BFF_MODE = 'mock';
    delete process.env.PRODUCTOS_AUTH_MODE;

    expect(catalogSource()).toBe('MOCK');

    const price = await new ProductPriceService().getPrice(SLUG);
    expect(price.data.sku).toBeTruthy();

    const availability =
      await new ProductAvailabilityService().getAvailability(SLUG);
    expect(availability.data.availability).toBeTruthy();

    const recommendations =
      await new ProductRecommendationsService().getRecommendations(SLUG);
    expect(recommendations.data.length).toBeGreaterThan(0);
  });
});
