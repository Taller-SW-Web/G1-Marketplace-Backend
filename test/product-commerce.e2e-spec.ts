/**
 * E2E — Endpoints BFF comerciales F-012…F-015 (MOCK).
 *
 * ⚠️ MOCK — Validan el modo MOCK mientras I-01 permanece bloqueado.
 *
 * @see SPECS/contrato-api/F-012-precio-oferta-descuento.md
 * @see SPECS/contrato-api/F-013-seleccion-atributos-variante.md
 * @see SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md
 * @see SPECS/contrato-api/F-015-productos-relacionados.md
 */

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProductAvailabilityController } from '../src/catalog/product-availability.controller';
import { ProductAvailabilityService } from '../src/catalog/product-availability.service';
import { ProductPriceController } from '../src/catalog/product-price.controller';
import { ProductPriceService } from '../src/catalog/product-price.service';
import { ProductRecommendationsController } from '../src/catalog/product-recommendations.controller';
import { ProductRecommendationsService } from '../src/catalog/product-recommendations.service';
import { ProductVariantsController } from '../src/catalog/product-variants.controller';
import { ProductVariantsService } from '../src/catalog/product-variants.service';
import { NotFoundFilter } from '../src/http/not-found.filter';
import { requestIdMiddleware } from '../src/http/request-id.middleware';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

describe('BFF comercial F-012…F-015 (e2e) — MOCK', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.BFF_MODE = 'mock';
    const moduleRef = await Test.createTestingModule({
      controllers: [
        ProductPriceController,
        ProductVariantsController,
        ProductAvailabilityController,
        ProductRecommendationsController,
      ],
      providers: [
        ProductPriceService,
        ProductVariantsService,
        ProductAvailabilityService,
        ProductRecommendationsService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.useGlobalFilters(new NotFoundFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  describe('F-012 — GET /products/:slug/price', () => {
    it('CA-F012-01/02: precio y oferta vigente con descuento derivado', async () => {
      const res = await get(
        '/api/v1/catalog/products/zapatillas-running-aero-x/price',
      ).expect(200);
      expect(res.headers['x-catalog-source']).toBe('MOCK');
      expect(res.headers['x-request-id']).toMatch(UUID_PATTERN);
      expect(res.body.data.sku).toBe('SKU-MOCK-001');
      expect(res.body.data.price.regularAmount).toBe(299.9);
      expect(res.body.data.price.saleAmount).toBe(254.9);
      expect(res.body.data.price.discountPercent).toBe(15);
      expect(res.body.meta.channel).toBe('MARKETPLACE');
    });

    it('CA-F012-03: sin oferta no devuelve porcentaje', async () => {
      const res = await get(
        '/api/v1/catalog/products/producto-demostracion-2/price',
      ).expect(200);
      expect(res.body.data.price.saleAmount).toBeNull();
      expect(res.body.data.price.discountPercent).toBeNull();
    });

    it('CA-F012-04: variantes sin SKU responde 409 Problem Details', async () => {
      const res = await get(
        '/api/v1/catalog/products/producto-variable-mock/price',
      ).expect(409);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({
        status: 409,
        code: 'PRODUCT_VARIANT_SELECTION_REQUIRED',
        instance: '/api/v1/catalog/products/producto-variable-mock/price',
      });
      expect(res.body.requestId).toMatch(UUID_PATTERN);
      expect(res.body).not.toHaveProperty('data');
    });

    it('rechaza un SKU ajeno al producto', async () => {
      const res = await get(
        '/api/v1/catalog/products/producto-variable-mock/price?sku=SKU-MOCK-001',
      ).expect(409);
      expect(res.body.code).toBe('SKU_NOT_BELONG_TO_PRODUCT');
    });

    it('resuelve el precio de una variante seleccionada', async () => {
      const res = await get(
        '/api/v1/catalog/products/producto-variable-mock/price?sku=SKU-MOCK-VAR-1',
      ).expect(200);
      expect(res.body.data.sku).toBe('SKU-MOCK-VAR-1');
      expect(res.body.data.price.discountPercent).toBe(14);
    });

    it('SKU válido sin precio → 422', async () => {
      const res = await get(
        '/api/v1/catalog/products/producto-variable-mock/price?sku=SKU-MOCK-VAR-3',
      ).expect(422);
      expect(res.body.code).toBe('PRICE_NOT_AVAILABLE');
    });

    it.each([
      ['producto-error-502-precio-mock', 502, 'PRICING_INVALID_RESPONSE'],
      ['producto-error-503-precio-mock', 503, 'PRICING_UNAVAILABLE'],
      ['producto-error-504-precio-mock', 504, 'PRICING_TIMEOUT'],
      ['producto-no-existente-precio-mock', 404, 'PRODUCT_NOT_AVAILABLE'],
    ])('slug %s → %i %s', async (slug, status, code) => {
      const res = await get(`/api/v1/catalog/products/${slug}/price`).expect(
        status,
      );
      expect(res.body.code).toBe(code);
    });

    it('slug inválido → 400 INVALID_PRODUCT_SLUG', async () => {
      const res = await get(
        '/api/v1/catalog/products/SLUG_INVALIDO!/price',
      ).expect(400);
      expect(res.body.code).toBe('INVALID_PRODUCT_SLUG');
    });

    it('no expone cupón, stock ni total de pedido', async () => {
      const res = await get(
        '/api/v1/catalog/products/zapatillas-running-aero-x/price',
      ).expect(200);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/coupon|cupón|stock|total/iu);
    });
  });

  describe('F-013 — GET /products/:slug/variants', () => {
    it('producto simple: hasVariants=false sin atributos', async () => {
      const res = await get(
        '/api/v1/catalog/products/zapatillas-running-aero-x/variants',
      ).expect(200);
      expect(res.body.data.hasVariants).toBe(false);
      expect(res.body.data.attributes).toEqual([]);
      expect(res.body.data.variants).toEqual([]);
      expect(res.headers['x-catalog-source']).toBe('MOCK');
    });

    it('filtra borradores y no expone stock ni precio', async () => {
      const res = await get(
        '/api/v1/catalog/products/producto-variable-mock/variants',
      ).expect(200);
      expect(res.body.data.hasVariants).toBe(true);
      expect(res.body.data.attributes).toHaveLength(2);
      expect(res.body.data.variants).toHaveLength(3);
      expect(
        res.body.data.variants.every(
          (variant: { status: string }) => variant.status === 'ACTIVE',
        ),
      ).toBe(true);
      expect(res.body.data.variants.map((v: { sku: string }) => v.sku)).toEqual([
        'SKU-MOCK-VAR-1',
        'SKU-MOCK-VAR-2',
        'SKU-MOCK-VAR-3',
      ]);
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toMatch(/"stock"|"price"/u);
    });

    it.each([
      ['producto-error-502-variantes-mock', 502, 'CATALOG_INVALID_RESPONSE'],
      ['producto-error-503-variantes-mock', 503, 'CATALOG_UNAVAILABLE'],
      ['producto-error-504-variantes-mock', 504, 'CATALOG_TIMEOUT'],
      ['no-existe', 404, 'PRODUCT_NOT_AVAILABLE'],
    ])('slug %s → %i %s', async (slug, status, code) => {
      const res = await get(
        `/api/v1/catalog/products/${slug}/variants`,
      ).expect(status);
      expect(res.body.code).toBe(code);
    });

    it('slug inválido → 400', async () => {
      const res = await get(
        '/api/v1/catalog/products/SLUG_INVALIDO!/variants',
      ).expect(400);
      expect(res.body.code).toBe('INVALID_PRODUCT_SLUG');
    });
  });

  describe('F-014 — GET /products/:slug/availability', () => {
    it('producto simple: AVAILABLE sin saldos ni ubicación', async () => {
      const res = await get(
        '/api/v1/catalog/products/zapatillas-running-aero-x/availability',
      ).expect(200);
      expect(res.body.data.availability).toBe('AVAILABLE');
      expect(res.headers['cache-control']).toContain('max-age=30');
      expect(res.body.data).not.toHaveProperty('quantity');
      expect(res.body.data).not.toHaveProperty('locationId');
      expect(res.body.data).not.toHaveProperty('onHand');
      expect(res.body.data).not.toHaveProperty('reserved');
    });

    it('mapea STOCK_LOW y OUT_OF_STOCK por SKU', async () => {
      const low = await get(
        '/api/v1/catalog/products/producto-variable-mock/availability?sku=SKU-MOCK-VAR-2',
      ).expect(200);
      const out = await get(
        '/api/v1/catalog/products/producto-variable-mock/availability?sku=SKU-MOCK-VAR-3',
      ).expect(200);
      expect(low.body.data.availability).toBe('STOCK_LOW');
      expect(out.body.data.availability).toBe('OUT_OF_STOCK');
    });

    it('exige SKU de variante y rechaza SKU ajeno', async () => {
      const required = await get(
        '/api/v1/catalog/products/producto-variable-mock/availability',
      ).expect(409);
      expect(required.body.code).toBe('PRODUCT_VARIANT_SELECTION_REQUIRED');

      const foreign = await get(
        '/api/v1/catalog/products/producto-variable-mock/availability?sku=SKU-MOCK-001',
      ).expect(409);
      expect(foreign.body.code).toBe('SKU_NOT_BELONG_TO_PRODUCT');
    });

    it('RC-F-014-01: un error de inventario no responde OUT_OF_STOCK', async () => {
      const res = await get(
        '/api/v1/catalog/products/producto-error-503-stock-mock/availability',
      ).expect(503);
      expect(res.body.code).toBe('INVENTORY_UNAVAILABLE');
      expect(JSON.stringify(res.body)).not.toContain('OUT_OF_STOCK');
    });

    it.each([
      ['producto-error-502-stock-mock', 502, 'INVENTORY_INVALID_RESPONSE'],
      ['producto-error-504-stock-mock', 504, 'INVENTORY_TIMEOUT'],
    ])('slug %s → %i %s', async (slug, status, code) => {
      const res = await get(
        `/api/v1/catalog/products/${slug}/availability`,
      ).expect(status);
      expect(res.body.code).toBe(code);
    });
  });

  describe('F-015 — GET /products/:slug/recommendations', () => {
    it('devuelve tarjetas completas, sin origen ni duplicados', async () => {
      const res = await get(
        '/api/v1/catalog/products/zapatillas-running-aero-x/recommendations',
      ).expect(200);
      expect(res.body.meta.sourceProductId).toBe('PRD-MOCK-001');
      expect(res.body.data).toHaveLength(4);
      const ids = res.body.data.map((card: { productId: string }) => card.productId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('PRD-MOCK-001');
      expect(res.body.data.every((card: { slug: string }) => card.slug)).toBe(
        true,
      );
    });

    it('CA-F015-03: vacío o fallo se degrada a arreglo vacío', async () => {
      const empty = await get(
        '/api/v1/catalog/products/producto-sin-relacionados-mock/recommendations',
      ).expect(200);
      expect(empty.body.data).toEqual([]);

      const degraded = await get(
        '/api/v1/catalog/products/producto-error-recomendaciones-mock/recommendations',
      ).expect(200);
      expect(degraded.body.data).toEqual([]);

      const unknown = await get(
        '/api/v1/catalog/products/no-existe/recommendations',
      ).expect(200);
      expect(unknown.body.data).toEqual([]);
    });

    it('omite candidatos incompletos y duplicados', async () => {
      const res = await get(
        '/api/v1/catalog/products/producto-relacionados-invalidos-mock/recommendations',
      ).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].productId).toBe('mock-product-8');
    });

    it('slug inválido → 400', async () => {
      const res = await get(
        '/api/v1/catalog/products/SLUG_INVALIDO!/recommendations',
      ).expect(400);
      expect(res.body.code).toBe('INVALID_PRODUCT_SLUG');
    });
  });
});
