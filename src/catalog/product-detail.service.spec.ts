/**
 * Tests unitarios — Servicio BFF Detalle de Producto (F-011)
 *
 * ⚠️ MOCK — Estos tests validan el modo MOCK (H3, I-01 bloqueado).
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md — API-CA-F011-01..05
 */

import { ProductDetailService } from './product-detail.service';
import { isProductDetailResponse } from './product-detail.dto';
import { CatalogException, ERROR_CODES } from './product-detail.errors';
import { MOCK_PRODUCT_SIMPLE } from './product-detail.fixture';

describe('ProductDetailService', () => {
  const service = new ProductDetailService();

  beforeAll(() => {
    process.env.BFF_MODE = 'mock';
  });

  afterEach(() => {
    process.env.BFF_MODE = 'mock';
  });

  it('retorna el fixture MOCK con meta.source=MOCK para un slug válido', async () => {
    const result = await service.getBySlug('zapatillas-running-aero-x');

    expect(result.data.productId).toBe('PRD-MOCK-001');
    expect(result.meta.source).toBe('MOCK');
    expect(new Date(result.meta.retrievedAt).toISOString()).toBe(
      result.meta.retrievedAt,
    );
  });

  it('retorna especificaciones vacías para producto-sin-specs-mock', async () => {
    const result = await service.getBySlug('producto-sin-specs-mock');
    expect(result.data.technicalSpecifications).toEqual([]);
  });

  it.each([
    ['producto-no-existente-mock', 404, ERROR_CODES.PRODUCT_NOT_AVAILABLE],
    ['producto-error-503-mock', 503, ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE],
    ['producto-error-504-mock', 504, ERROR_CODES.PRODUCT_CATALOG_TIMEOUT],
  ])('slugs especiales %s → %i %s', async (slug, status, code) => {
    await expect(service.getBySlug(slug)).rejects.toMatchObject({
      status,
      response: { error: { code } },
    });
  });

  it('fuera de modo mock devuelve 503 (gate I-01 sin cerrar)', async () => {
    process.env.BFF_MODE = 'real';
    await expect(service.getBySlug('zapatillas-running-aero-x')).rejects.toMatchObject({
      status: 503,
      response: { error: { code: ERROR_CODES.PRODUCT_CATALOG_UNAVAILABLE } },
    });
  });

  it('CatalogException expone el sobre {error:{code,message}}', () => {
    const exception = new CatalogException(400, ERROR_CODES.INVALID_PRODUCT_SLUG, 'x');
    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      error: { code: 'INVALID_PRODUCT_SLUG', message: 'x' },
    });
  });
});

describe('isProductDetailResponse (guardia de contrato)', () => {
  it('acepta el fixture MOCK', () => {
    expect(isProductDetailResponse(MOCK_PRODUCT_SIMPLE)).toBe(true);
  });

  it.each([
    ['sin productId', (fixture: typeof MOCK_PRODUCT_SIMPLE) => ({ ...fixture, data: { ...fixture.data, productId: '' } })],
    ['media vacía', (fixture: typeof MOCK_PRODUCT_SIMPLE) => ({ ...fixture, data: { ...fixture.data, media: [] } })],
    ['media sin HTTPS', (fixture: typeof MOCK_PRODUCT_SIMPLE) => ({
      ...fixture,
      data: { ...fixture.data, media: [{ ...fixture.data.media[0], url: 'http://insecure.test' }] },
    })],
    ['sin meta', (fixture: typeof MOCK_PRODUCT_SIMPLE) => ({ ...fixture, meta: undefined })],
    ['incluye precio (campo excluido del contrato)', (fixture: typeof MOCK_PRODUCT_SIMPLE) => ({
      ...fixture,
      data: { ...fixture.data, price: 99.9 },
    })],
  ])('rechaza respuesta %s', (_label, mutate) => {
    expect(isProductDetailResponse(mutate(MOCK_PRODUCT_SIMPLE))).toBe(false);
  });
});
