/**
 * Tests unitarios — endpoints BFF comerciales F-012…F-015 (MOCK).
 *
 * ⚠️ MOCK — Validan el modo MOCK mientras I-01 permanece bloqueado.
 *
 * @see SPECS/contrato-api/F-012-precio-oferta-descuento.md
 * @see SPECS/contrato-api/F-013-seleccion-atributos-variante.md
 * @see SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md
 * @see SPECS/contrato-api/F-015-productos-relacionados.md
 */

import {
  applyPriceWindow,
  deriveDiscountPercent,
  isProductPriceResponse,
  type PriceDTO,
} from './product-price.dto';
import { PRICE_ERROR_CODES } from './product-price.errors';
import { ProductPriceService } from './product-price.service';
import { MOCK_PRICE_SIMPLE } from './product-price.fixture';
import {
  isProductVariantsResponse,
  type ProductVariantsResponseDTO,
} from './product-variants.dto';
import { ProductVariantsService } from './product-variants.service';
import { VARIANT_ERROR_CODES } from './product-variants.errors';
import {
  isProductAvailabilityResponse,
  type ProductAvailabilityResponseDTO,
} from './product-availability.dto';
import { ProductAvailabilityService } from './product-availability.service';
import { AVAILABILITY_ERROR_CODES } from './product-availability.errors';
import {
  isRecommendationsResponse,
  type RecommendationCardDTO,
  type RecommendationsResponseDTO,
} from './product-recommendations.dto';
import { ProductRecommendationsService } from './product-recommendations.service';

const expectStatus = async (
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    status,
    response: { error: { code } },
  });
};

describe('ProductPriceService (F-012 · MOCK)', () => {
  const service = new ProductPriceService();

  beforeEach(() => {
    process.env.BFF_MODE = 'mock';
  });

  it('CA-F012-01: un producto simple resuelve su SKU y precio regular', async () => {
    const result = await service.getPrice('producto-demostracion-1');
    expect(result.data.productId).toBe('mock-product-1');
    expect(result.data.sku).toBe('SKU-MOCK-002');
    expect(result.data.price.regularAmount).toBe(89.9);
    expect(result.data.price.saleAmount).toBeNull();
    expect(result.data.price.discountPercent).toBeNull();
    expect(result.meta.channel).toBe('MARKETPLACE');
  });

  it('CA-F012-02: deriva el descuento de los importes autoritativos', async () => {
    const result = await service.getPrice('zapatillas-running-aero-x');
    expect(result.data.sku).toBe('SKU-MOCK-001');
    expect(result.data.price.regularAmount).toBe(299.9);
    expect(result.data.price.saleAmount).toBe(254.9);
    expect(result.data.price.discountPercent).toBe(15);
    expect(result.data.price.validUntil).not.toBeNull();
  });

  it('CA-F012-03: sin oferta no inventa 0 %', async () => {
    const result = await service.getPrice('producto-demostracion-2');
    expect(result.data.price.saleAmount).toBeNull();
    expect(result.data.price.discountPercent).toBeNull();
  });

  it('CA-F012-04: producto con variantes sin SKU → 409', async () => {
    await expectStatus(
      service.getPrice('producto-variable-mock'),
      409,
      PRICE_ERROR_CODES.PRODUCT_VARIANT_SELECTION_REQUIRED,
    );
  });

  it('rechaza un SKU ajeno al producto → 409', async () => {
    await expectStatus(
      service.getPrice('producto-variable-mock', 'SKU-MOCK-001'),
      409,
      PRICE_ERROR_CODES.SKU_NOT_BELONG_TO_PRODUCT,
    );
  });

  it('un SKU válido sin precio vigente → 422', async () => {
    await expectStatus(
      service.getPrice('producto-variable-mock', 'SKU-MOCK-VAR-3'),
      422,
      PRICE_ERROR_CODES.PRICE_NOT_AVAILABLE,
    );
  });

  it('resuelve el precio de una variante seleccionada', async () => {
    const result = await service.getPrice(
      'producto-variable-mock',
      'SKU-MOCK-VAR-1',
    );
    expect(result.data.sku).toBe('SKU-MOCK-VAR-1');
    expect(result.data.price.saleAmount).toBe(299.9);
  });

  it('slug desconocido → 404 y slugs de error → códigos de Pricing', async () => {
    await expectStatus(
      service.getPrice('no-existe'),
      404,
      PRICE_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
    );
    await expectStatus(
      service.getPrice('producto-error-422-precio-mock'),
      422,
      PRICE_ERROR_CODES.PRICE_NOT_AVAILABLE,
    );
    await expectStatus(
      service.getPrice('producto-error-502-precio-mock'),
      502,
      PRICE_ERROR_CODES.PRICING_INVALID_RESPONSE,
    );
    await expectStatus(
      service.getPrice('producto-error-503-precio-mock'),
      503,
      PRICE_ERROR_CODES.PRICING_UNAVAILABLE,
    );
    await expectStatus(
      service.getPrice('producto-error-504-precio-mock'),
      504,
      PRICE_ERROR_CODES.PRICING_TIMEOUT,
    );
  });

  it('fuera de modo mock → 503 (gate I-01 sin cerrar)', async () => {
    process.env.BFF_MODE = 'real';
    await expectStatus(
      service.getPrice('zapatillas-running-aero-x'),
      503,
      PRICE_ERROR_CODES.PRICING_UNAVAILABLE,
    );
  });
});

describe('F-012 — reglas de precio', () => {
  const base: PriceDTO = {
    regularAmount: 200,
    saleAmount: 170,
    currency: 'PEN',
    discountPercent: null,
    validFrom: '2026-09-01T00:00:00Z',
    validUntil: '2026-10-01T00:00:00Z',
    priceVersion: 8,
  };

  it('RN-F012-03: round((regular - sale) / regular × 100)', () => {
    expect(deriveDiscountPercent(200, 170)).toBe(15);
    expect(deriveDiscountPercent(299.9, 254.9)).toBe(15);
    expect(deriveDiscountPercent(200, null)).toBeNull();
    expect(deriveDiscountPercent(200, 200)).toBeNull();
    expect(deriveDiscountPercent(0, 10)).toBeNull();
  });

  it('una oferta vencida se presenta como precio regular', () => {
    const result = applyPriceWindow(base, new Date('2026-11-01T00:00:00Z'));
    expect(result.saleAmount).toBeNull();
    expect(result.discountPercent).toBeNull();
    expect(result.validUntil).toBeNull();
    expect(result.regularAmount).toBe(200);
  });

  it('una oferta aún no iniciada no se presenta', () => {
    const result = applyPriceWindow(base, new Date('2026-08-01T00:00:00Z'));
    expect(result.saleAmount).toBeNull();
  });

  it('una oferta vigente deriva el descuento', () => {
    const result = applyPriceWindow(base, new Date('2026-09-15T00:00:00Z'));
    expect(result.discountPercent).toBe(15);
  });

  it('la guardia rechaza moneda, importes y descuentos inválidos', () => {
    const validPrice = applyPriceWindow(base, new Date('2026-09-15T00:00:00Z'));
    const response = {
      data: {
        productId: MOCK_PRICE_SIMPLE.productId,
        sku: 'SKU-MOCK-001',
        price: validPrice,
      },
      meta: { channel: 'MARKETPLACE' as const, retrievedAt: '2026-09-27T18:15:00Z' },
    };
    expect(isProductPriceResponse(response)).toBe(true);

    expect(
      isProductPriceResponse({
        ...response,
        data: { ...response.data, price: { ...validPrice, currency: 'PEN1' } },
      }),
    ).toBe(false);
    expect(
      isProductPriceResponse({
        ...response,
        data: { ...response.data, price: { ...validPrice, regularAmount: 0 } },
      }),
    ).toBe(false);
    expect(
      isProductPriceResponse({
        ...response,
        data: { ...response.data, price: { ...validPrice, saleAmount: 220 } },
      }),
    ).toBe(false);
    expect(
      isProductPriceResponse({
        ...response,
        data: { ...response.data, price: { ...validPrice, discountPercent: 10 } },
      }),
    ).toBe(false);
  });
});

describe('ProductVariantsService (F-013 · MOCK)', () => {
  const service = new ProductVariantsService();

  beforeEach(() => {
    process.env.BFF_MODE = 'mock';
  });

  it('un producto simple no presenta selector', async () => {
    const result = await service.getBySlug('zapatillas-running-aero-x');
    expect(result.data.hasVariants).toBe(false);
    expect(result.data.attributes).toEqual([]);
    expect(result.data.variants).toEqual([]);
  });

  it('filtra variantes no activas y conserva sólo combinaciones válidas', async () => {
    const result = await service.getBySlug('producto-variable-mock');
    expect(result.data.hasVariants).toBe(true);
    expect(result.data.attributes.map((attribute) => attribute.id)).toEqual([
      'color',
      'size',
    ]);
    expect(result.data.variants.map((variant) => variant.sku)).toEqual([
      'SKU-MOCK-VAR-1',
      'SKU-MOCK-VAR-2',
      'SKU-MOCK-VAR-3',
    ]);
    expect(
      result.data.variants.some((variant) => variant.variantId === 'VAR-MOCK-4'),
    ).toBe(false);
    expect(result.data.variants[0].status).toBe('ACTIVE');
  });

  it('slug desconocido → 404 y errores de catálogo normalizados', async () => {
    await expectStatus(
      service.getBySlug('no-existe'),
      404,
      VARIANT_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
    );
    await expectStatus(
      service.getBySlug('producto-error-502-variantes-mock'),
      502,
      VARIANT_ERROR_CODES.CATALOG_INVALID_RESPONSE,
    );
    await expectStatus(
      service.getBySlug('producto-error-503-variantes-mock'),
      503,
      VARIANT_ERROR_CODES.CATALOG_UNAVAILABLE,
    );
    await expectStatus(
      service.getBySlug('producto-error-504-variantes-mock'),
      504,
      VARIANT_ERROR_CODES.CATALOG_TIMEOUT,
    );
  });

  it('fuera de modo mock → 503', async () => {
    process.env.BFF_MODE = 'real';
    await expectStatus(
      service.getBySlug('producto-variable-mock'),
      503,
      VARIANT_ERROR_CODES.CATALOG_UNAVAILABLE,
    );
  });

  it('API-CA-F013-02: rechaza SKU ausente, duplicado o combinación repetida', () => {
    const fixture = {
      data: {
        productId: 'PRD-1',
        hasVariants: true,
        attributes: [
          { id: 'color', label: 'Color', values: [{ id: 'negro', label: 'Negro' }] },
          { id: 'size', label: 'Talla', values: [{ id: '42', label: '42' }] },
        ],
        variants: [
          {
            variantId: 'VAR-1',
            sku: 'SKU-1',
            status: 'ACTIVE' as const,
            attributes: { color: 'negro', size: '42' },
            image: null,
          },
        ],
      },
    };
    expect(isProductVariantsResponse(fixture)).toBe(true);

    expect(
      isProductVariantsResponse({
        ...fixture,
        data: {
          ...fixture.data,
          variants: [{ ...fixture.data.variants[0], sku: '' }],
        },
      }),
    ).toBe(false);
    expect(
      isProductVariantsResponse({
        ...fixture,
        data: {
          ...fixture.data,
          variants: [
            fixture.data.variants[0],
            { ...fixture.data.variants[0], variantId: 'VAR-2' },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isProductVariantsResponse({
        ...fixture,
        data: {
          ...fixture.data,
          variants: [{ ...fixture.data.variants[0], attributes: { color: 'negro' } }],
        },
      }),
    ).toBe(false);
    expect(
      isProductVariantsResponse({
        ...fixture,
        data: {
          ...fixture.data,
          variants: [{ ...fixture.data.variants[0], stock: 3 }],
        },
      }),
    ).toBe(false);
  });

  it('el fixture MOCK cumple la guardia', async () => {
    const result = await service.getBySlug('producto-variable-mock');
    expect(isProductVariantsResponse(result)).toBe(true);
  });
});

describe('ProductAvailabilityService (F-014 · MOCK)', () => {
  const service = new ProductAvailabilityService();

  beforeEach(() => {
    process.env.BFF_MODE = 'mock';
  });

  it('producto simple → AVAILABLE sin cantidades ni ubicación', async () => {
    const result = await service.getAvailability('zapatillas-running-aero-x');
    expect(result.data.availability).toBe('AVAILABLE');
    expect(result.data).not.toHaveProperty('quantity');
    expect(result.data).not.toHaveProperty('locationId');
    expect(Date.parse(result.data.checkedAt)).not.toBeNaN();
  });

  it('mapea los tres estados comerciales por SKU', async () => {
    const available = await service.getAvailability(
      'producto-variable-mock',
      'SKU-MOCK-VAR-1',
    );
    const low = await service.getAvailability(
      'producto-variable-mock',
      'SKU-MOCK-VAR-2',
    );
    const out = await service.getAvailability(
      'producto-variable-mock',
      'SKU-MOCK-VAR-3',
    );
    expect(available.data.availability).toBe('AVAILABLE');
    expect(low.data.availability).toBe('STOCK_LOW');
    expect(out.data.availability).toBe('OUT_OF_STOCK');
  });

  it('exige selección de variante y rechaza SKU ajeno', async () => {
    await expectStatus(
      service.getAvailability('producto-variable-mock'),
      409,
      AVAILABILITY_ERROR_CODES.PRODUCT_VARIANT_SELECTION_REQUIRED,
    );
    await expectStatus(
      service.getAvailability('producto-variable-mock', 'SKU-MOCK-001'),
      409,
      AVAILABILITY_ERROR_CODES.SKU_NOT_BELONG_TO_PRODUCT,
    );
  });

  it('RC-F-014-01: un fallo de inventario no se presenta como agotado', async () => {
    await expectStatus(
      service.getAvailability('producto-error-503-stock-mock'),
      503,
      AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE,
    );
    await expectStatus(
      service.getAvailability('producto-error-504-stock-mock'),
      504,
      AVAILABILITY_ERROR_CODES.INVENTORY_TIMEOUT,
    );
    await expectStatus(
      service.getAvailability('producto-error-502-stock-mock'),
      502,
      AVAILABILITY_ERROR_CODES.INVENTORY_INVALID_RESPONSE,
    );
  });

  it('slug desconocido → 404; fuera de mock → 503', async () => {
    await expectStatus(
      service.getAvailability('no-existe'),
      404,
      AVAILABILITY_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
    );
    process.env.BFF_MODE = 'real';
    await expectStatus(
      service.getAvailability('zapatillas-running-aero-x'),
      503,
      AVAILABILITY_ERROR_CODES.INVENTORY_UNAVAILABLE,
    );
  });

  it('la guardia rechaza estados no homologados y saldos internos', () => {
    const response = {
      data: {
        productId: 'PRD-1',
        sku: 'SKU-1',
        availability: 'AVAILABLE' as const,
        checkedAt: '2026-09-27T18:15:00Z',
      },
    } satisfies ProductAvailabilityResponseDTO;
    expect(isProductAvailabilityResponse(response)).toBe(true);
    expect(
      isProductAvailabilityResponse({
        ...response,
        data: {
          ...response.data,
          availability: 'INDETERMINADO',
        },
      }),
    ).toBe(false);
    expect(
      isProductAvailabilityResponse({
        ...response,
        data: { ...response.data, quantity: 3 },
      }),
    ).toBe(false);
  });
});

describe('ProductRecommendationsService (F-015 · MOCK)', () => {
  const service = new ProductRecommendationsService();

  beforeEach(() => {
    process.env.BFF_MODE = 'mock';
  });

  it('devuelve hasta 8 tarjetas sin el producto origen', async () => {
    const result = await service.getRecommendations(
      'zapatillas-running-aero-x',
    );
    expect(result.data).toHaveLength(4);
    expect(result.data.map((card) => card.productId)).not.toContain(
      'PRD-MOCK-001',
    );
    expect(result.data.map((card) => card.presentationOrder)).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('omite candidatos incompletos y deduplica', async () => {
    const result = await service.getRecommendations(
      'producto-relacionados-invalidos-mock',
    );
    expect(result.data).toHaveLength(1);
    expect(result.data[0].productId).toBe('mock-product-8');
  });

  it('CA-F015-03: vacío o fallo se degrada a sección omitida', async () => {
    await expect(
      service.getRecommendations('producto-sin-relacionados-mock'),
    ).resolves.toMatchObject({ data: [] });
    await expect(
      service.getRecommendations('producto-error-recomendaciones-mock'),
    ).resolves.toMatchObject({ data: [] });
    await expect(service.getRecommendations('no-existe')).resolves.toMatchObject({
      data: [],
    });
  });

  it('precio null no se convierte en cero', async () => {
    const result = await service.getRecommendations(
      'zapatillas-running-aero-x',
    );
    expect(result.data[2].price).toBeNull();
  });

  it('la guardia rechaza duplicados, origen, >8 e imagen inválida', () => {
    const card: RecommendationCardDTO = {
      productId: 'PRD-REC-1',
      slug: 'medias-runner',
      name: 'Medias Runner',
      image: { url: 'https://cdn.example/medias.webp', alt: 'Medias' },
      type: 'CROSS_SELL',
      price: { amount: 89.9, currency: 'PEN' },
      presentationOrder: 1,
    };
    const response: RecommendationsResponseDTO = {
      data: [card],
      meta: { sourceProductId: 'PRD-1' },
    };
    expect(isRecommendationsResponse(response)).toBe(true);
    expect(
      isRecommendationsResponse({
        ...response,
        data: [card, { ...card }],
      }),
    ).toBe(false);
    expect(
      isRecommendationsResponse({
        ...response,
        data: [{ ...card, productId: 'PRD-1' }],
      }),
    ).toBe(false);
    expect(
      isRecommendationsResponse({
        ...response,
        data: [{ ...card, image: { url: 'http://insecure.test/x.png', alt: 'x' } }],
      }),
    ).toBe(false);
    expect(
      isRecommendationsResponse({
        ...response,
        data: Array.from({ length: 9 }, (_, index) => ({
          ...card,
          productId: `PRD-REC-${index}`,
          slug: `producto-${index}`,
        })),
      }),
    ).toBe(false);
  });
});
