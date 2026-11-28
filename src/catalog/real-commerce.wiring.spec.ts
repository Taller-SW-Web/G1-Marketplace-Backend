/**
 * Tests unitarios — cableado REAL de precio (F-012) y disponibilidad (F-014).
 *
 * Doble local: no se llama a G6 ni a G7. Se simulan el resolutor de SKU y el
 * adaptador comercial para comprobar la traducción de resultados y errores a los
 * códigos de contrato, y que el cierre por defecto (503) se mantiene.
 */

import { BffCatalogException } from './bff-catalog.exception';
import { AVAILABILITY_ERROR_CODES } from './product-availability.errors';
import { ProductAvailabilityService } from './product-availability.service';
import { PRICE_ERROR_CODES } from './product-price.errors';
import { ProductPriceService } from './product-price.service';
import * as realCommerce from './real-commerce';

jest.mock('./real-commerce', () => {
  const actual = jest.requireActual('./real-commerce');
  return {
    ...actual,
    assertOperationApproved: jest.fn(),
    resolveRealSku: jest.fn(),
    getRealCommerceAdapter: jest.fn(),
  };
});

const assertOperationApproved = realCommerce.assertOperationApproved as jest.Mock;
const resolveRealSku = realCommerce.resolveRealSku as jest.Mock;
const getRealCommerceAdapter = realCommerce.getRealCommerceAdapter as jest.Mock;
const { RealCommerceError } = jest.requireActual('./real-commerce') as typeof realCommerce;

const RESOLVED = { productId: '32a4172c-81b2-b643-1d0f-ae66f627f2ef', sku: 'ADI-ENT22-AZU-M' };
const PRICE = {
  data: {
    productId: RESOLVED.productId,
    sku: RESOLVED.sku,
    price: {
      regularAmount: 79.9, saleAmount: null, currency: 'PEN', discountPercent: null,
      validFrom: '2026-10-01T05:00:00.000Z', validUntil: null, priceVersion: 1,
    },
  },
  meta: { channel: 'MARKETPLACE', retrievedAt: '2026-11-27T23:57:49.000Z' },
};
const AVAILABILITY = {
  data: { productId: RESOLVED.productId, sku: RESOLVED.sku, availability: 'AVAILABLE', checkedAt: '2026-11-27T23:57:49.000Z' },
};

const expectStatus = async (promise: Promise<unknown>, status: number, code: string): Promise<void> => {
  await expect(promise).rejects.toMatchObject({ status, response: { error: { code } } });
};

describe('ProductPriceService (F-012 · REAL)', () => {
  const service = new ProductPriceService();
  const adapter = { getPrice: jest.fn(), getAvailability: jest.fn() };

  beforeEach(() => {
    process.env.BFF_MODE = 'real';
    assertOperationApproved.mockReset();
    resolveRealSku.mockReset().mockResolvedValue(RESOLVED);
    adapter.getPrice.mockReset().mockResolvedValue(PRICE);
    getRealCommerceAdapter.mockReset().mockReturnValue(adapter);
  });

  afterAll(() => {
    process.env.BFF_MODE = 'mock';
  });

  it('devuelve el precio REAL del adaptador con el SKU resuelto', async () => {
    await expect(service.getPrice('ent22-inka-athletics', 'ADI-ENT22-AZU-M')).resolves.toEqual(PRICE);
    expect(resolveRealSku).toHaveBeenCalledWith('ent22-inka-athletics', 'ADI-ENT22-AZU-M');
    expect(adapter.getPrice).toHaveBeenCalledWith(RESOLVED);
  });

  it.each([
    ['INVALID_SLUG', 400, PRICE_ERROR_CODES.INVALID_PRODUCT_SLUG],
    ['NOT_AVAILABLE', 404, PRICE_ERROR_CODES.PRODUCT_NOT_AVAILABLE],
    ['SELECTION_REQUIRED', 409, PRICE_ERROR_CODES.PRODUCT_VARIANT_SELECTION_REQUIRED],
    ['SKU_MISMATCH', 409, PRICE_ERROR_CODES.SKU_NOT_BELONG_TO_PRODUCT],
    ['TIMEOUT', 504, PRICE_ERROR_CODES.PRICING_TIMEOUT],
    ['INVALID', 502, PRICE_ERROR_CODES.PRICING_INVALID_RESPONSE],
    ['UNAVAILABLE', 503, PRICE_ERROR_CODES.PRICING_UNAVAILABLE],
  ] as const)('traduce el error %s del resolutor de SKU a %i', async (kind, status, code) => {
    resolveRealSku.mockRejectedValue(new RealCommerceError(kind));
    await expectStatus(service.getPrice('ent22-inka-athletics', 'X'), status, code);
    expect(adapter.getPrice).not.toHaveBeenCalled();
  });

  it('deja pasar los errores del adaptador (p. ej. 422 sin precio vigente)', async () => {
    adapter.getPrice.mockRejectedValue(
      new BffCatalogException(422, PRICE_ERROR_CODES.PRICE_NOT_AVAILABLE, 'sin precio'),
    );
    await expectStatus(service.getPrice('ent22-inka-athletics', 'ADI-ENT22-AZU-M'), 422, PRICE_ERROR_CODES.PRICE_NOT_AVAILABLE);
  });

  it('un error inesperado nunca inventa un precio: 503', async () => {
    adapter.getPrice.mockRejectedValue(new Error('boom'));
    await expectStatus(service.getPrice('ent22-inka-athletics', 'ADI-ENT22-AZU-M'), 503, PRICE_ERROR_CODES.PRICING_UNAVAILABLE);
  });

  it('cierre por defecto: si el adaptador no está aprobado responde 503', async () => {
    getRealCommerceAdapter.mockImplementation(() => {
      throw new RealCommerceError('UNAVAILABLE');
    });
    await expectStatus(service.getPrice('ent22-inka-athletics', 'ADI-ENT22-AZU-M'), 503, PRICE_ERROR_CODES.PRICING_UNAVAILABLE);
  });

  it('sin aprobación de la operación responde 503 SIN resolver el SKU ni llamar a G6', async () => {
    assertOperationApproved.mockImplementation(() => {
      throw new RealCommerceError('UNAVAILABLE');
    });
    await expectStatus(service.getPrice('ent22-inka-athletics', 'ADI-ENT22-AZU-M'), 503, PRICE_ERROR_CODES.PRICING_UNAVAILABLE);
    expect(assertOperationApproved).toHaveBeenCalledWith('price');
    expect(resolveRealSku).not.toHaveBeenCalled();
    expect(adapter.getPrice).not.toHaveBeenCalled();
  });
});

describe('assertOperationApproved (cierre previo a cualquier llamada)', () => {
  const { assertOperationApproved: real } = jest.requireActual('./real-commerce') as typeof realCommerce;

  it('exige la aprobación global y la de cada operación', () => {
    expect(() => real('price', {})).toThrow();
    expect(() => real('price', { CATALOG_INTEGRATION_APPROVED: 'true' })).toThrow();
    expect(() => real('availability', { CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_PRICE_INTEGRATION_APPROVED: 'true' })).toThrow();
    expect(() => real('price', { CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_PRICE_INTEGRATION_APPROVED: 'true' })).not.toThrow();
    expect(() => real('availability', { CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_AVAILABILITY_INTEGRATION_APPROVED: 'true' })).not.toThrow();
  });
});

describe('ProductAvailabilityService (F-014 · REAL)', () => {
  const service = new ProductAvailabilityService();
  const adapter = { getPrice: jest.fn(), getAvailability: jest.fn() };

  beforeEach(() => {
    process.env.BFF_MODE = 'real';
    assertOperationApproved.mockReset();
    resolveRealSku.mockReset().mockResolvedValue(RESOLVED);
    adapter.getAvailability.mockReset().mockResolvedValue(AVAILABILITY);
    getRealCommerceAdapter.mockReset().mockReturnValue(adapter);
  });

  afterAll(() => {
    process.env.BFF_MODE = 'mock';
  });

  it('devuelve la disponibilidad REAL del adaptador con el SKU resuelto', async () => {
    await expect(service.getAvailability('ent22-inka-athletics', 'ADI-ENT22-AZU-M')).resolves.toEqual(AVAILABILITY);
    expect(adapter.getAvailability).toHaveBeenCalledWith(RESOLVED);
  });

  it.each([
    ['INVALID_SLUG', 400, AVAILABILITY_ERROR_CODES.INVALID_PRODUCT_SLUG],
    ['NOT_AVAILABLE', 404, AVAILABILITY_ERROR_CODES.PRODUCT_NOT_AVAILABLE],
    ['SELECTION_REQUIRED', 409, AVAILABILITY_ERROR_CODES.PRODUCT_VARIANT_SELECTION_REQUIRED],
    ['SKU_MISMATCH', 409, AVAILABILITY_ERROR_CODES.SKU_NOT_BELONG_TO_PRODUCT],
    ['TIMEOUT', 504, AVAILABILITY_ERROR_CODES.INVENTORY_TIMEOUT],
    ['INVALID', 502, AVAILABILITY_ERROR_CODES.INVENTORY_INVALID_RESPONSE],
    ['UNAVAILABLE', 503, AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE],
  ] as const)('traduce el error %s del resolutor de SKU a %i', async (kind, status, code) => {
    resolveRealSku.mockRejectedValue(new RealCommerceError(kind));
    await expectStatus(service.getAvailability('ent22-inka-athletics', 'X'), status, code);
    expect(adapter.getAvailability).not.toHaveBeenCalled();
  });

  it('un fallo de Inventario nunca se traduce a agotado: 503', async () => {
    adapter.getAvailability.mockRejectedValue(new Error('boom'));
    await expectStatus(service.getAvailability('ent22-inka-athletics', 'ADI-ENT22-AZU-M'), 503, AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE);
  });

  it('cierre por defecto: si el adaptador no está aprobado responde 503', async () => {
    getRealCommerceAdapter.mockImplementation(() => {
      throw new RealCommerceError('UNAVAILABLE');
    });
    await expectStatus(service.getAvailability('ent22-inka-athletics', 'ADI-ENT22-AZU-M'), 503, AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE);
  });
});
