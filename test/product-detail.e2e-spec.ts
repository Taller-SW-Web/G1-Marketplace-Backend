/**
 * E2E — Endpoint BFF Detalle de Producto (F-011)
 *
 * Pruebas obligatorias de H3 (Backend):
 *   RC-F-011-BE-01 — Slug inválido retorna 400
 *   RC-F-011-BE-02 — Producto MOCK encontrado retorna 200
 *   RC-F-011-BE-03 — Slug de producto inexistente retorna 404
 *   RC-F-011-BE-04 — Slug de error de servicio retorna 503
 *   RC-F-011-BE-05 — Respuesta no contiene campos comerciales
 *
 * ⚠️ MOCK — Estos tests validan el modo MOCK (H3, I-01 bloqueado).
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md — API-CA-F011-01..05
 */

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ProductDetailController } from '../src/catalog/product-detail.controller';
import { ProductDetailService } from '../src/catalog/product-detail.service';
import { NotFoundFilter } from '../src/http/not-found.filter';

describe('ProductDetailController (e2e) — F-011 MOCK', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.BFF_MODE = 'mock';
    const moduleRef = await Test.createTestingModule({
      controllers: [ProductDetailController],
      providers: [ProductDetailService],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new NotFoundFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  // ─── RC-F-011-BE-01: Slug inválido retorna 400 ──────────────
  describe('RC-F-011-BE-01 — Slug inválido retorna 400', () => {
    it('retorna 400 cuando el slug tiene formato inválido (mayúsculas)', async () => {
      const res = await get('/api/v1/catalog/products/SLUG_INVALIDO!').expect(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_PRODUCT_SLUG');
    });

    it('retorna 400 cuando el slug tiene caracteres especiales', async () => {
      const res = await get('/api/v1/catalog/products/slug@invalido').expect(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCT_SLUG');
    });

    it('retorna 400 cuando el slug excede 120 caracteres', async () => {
      const longSlug = 'a'.repeat(121);
      const res = await get(`/api/v1/catalog/products/${longSlug}`).expect(400);
      expect(res.body.error.code).toBe('INVALID_PRODUCT_SLUG');
    });

    it('retorna 404 para la ruta sin slug (el listado /products es F-006/F-007)', async () => {
      // Sin segmento slug no existe este recurso; el NotFoundFilter responde 404.
      const res = await get('/api/v1/catalog/products/').expect(404);
      expect(res.body).toEqual({ error: 'Ruta no encontrada' });
    });
  });

  // ─── RC-F-011-BE-02: Producto MOCK encontrado retorna 200 ───
  describe('RC-F-011-BE-02 — Producto MOCK encontrado retorna 200', () => {
    it('retorna 200 con datos MOCK para slug válido', async () => {
      const res = await get('/api/v1/catalog/products/zapatillas-running-aero-x').expect(200);
      expect(res.body.data.productId).toBe('PRD-MOCK-001');
      expect(res.body.meta.source).toBe('MOCK');
    });

    it('la respuesta tiene la estructura correcta del contrato F-011', async () => {
      const res = await get('/api/v1/catalog/products/zapatillas-running-aero-x').expect(200);
      const { data, meta } = res.body;

      expect(data.slug).toBe('zapatillas-running-aero-x');
      expect(data.name).toContain('[MOCK]');
      expect(data.brand).toEqual({ brandId: 'BR-MOCK', name: 'BrandMock' });
      expect(Array.isArray(data.technicalSpecifications)).toBe(true);
      expect(Array.isArray(data.media)).toBe(true);
      expect(data.media.length).toBeGreaterThan(0);
      expect(data.media.every((m: { type: string }) => m.type === 'IMAGE')).toBe(true);
      expect(meta.source).toBe('MOCK');
      expect(new Date(meta.retrievedAt).toISOString()).toBe(meta.retrievedAt);
    });

    it('preserva los acentos (UTF-8) de la descripción', async () => {
      const res = await get('/api/v1/catalog/products/zapatillas-running-aero-x').expect(200);
      expect(res.body.data.description).toBe('Descripción de prueba. Producto ficticio.');
    });

    it('expone el header X-Catalog-Source: MOCK', async () => {
      await get('/api/v1/catalog/products/zapatillas-running-aero-x')
        .expect(200)
        .expect('X-Catalog-Source', 'MOCK');
    });
  });

  // ─── RC-F-011-BE-03: Slug de producto inexistente retorna 404 ─
  describe('RC-F-011-BE-03 — Slug de producto inexistente retorna 404', () => {
    it('retorna 404 para slug de producto no existente', async () => {
      const res = await get('/api/v1/catalog/products/producto-no-existente-mock').expect(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_AVAILABLE');
    });

    it('conserva X-Catalog-Source también en respuestas de error', async () => {
      await get('/api/v1/catalog/products/producto-no-existente-mock')
        .expect(404)
        .expect('X-Catalog-Source', 'MOCK');
    });
  });

  // ─── RC-F-011-BE-04: Slug de error de servicio retorna 503 ───
  describe('RC-F-011-BE-04 — Slug de error de servicio retorna 503', () => {
    it('retorna 503 cuando el servicio de catálogo no está disponible', async () => {
      const res = await get('/api/v1/catalog/products/producto-error-503-mock').expect(503);
      expect(res.body.error.code).toBe('PRODUCT_CATALOG_UNAVAILABLE');
    });
  });

  // ─── RC-F-011-BE-05: Respuesta no contiene campos comerciales ─
  describe('RC-F-011-BE-05 — Respuesta no contiene campos comerciales', () => {
    it('no incluye precio, stock ni variantes en la respuesta MOCK', async () => {
      const res = await get('/api/v1/catalog/products/zapatillas-running-aero-x').expect(200);
      expect(res.body.data.price).toBeUndefined();
      expect(res.body.data.stock).toBeUndefined();
      expect(res.body.data.variants).toBeUndefined();
    });
  });

  // ─── Tests adicionales ──────────────────────────────────────
  describe('Tests adicionales', () => {
    it('producto sin specs retorna array vacío de technicalSpecifications', async () => {
      const res = await get('/api/v1/catalog/products/producto-sin-specs-mock').expect(200);
      expect(res.body.data.technicalSpecifications).toEqual([]);
      expect(res.body.meta.source).toBe('MOCK');
    });

    it('producto con error de timeout retorna 504 PRODUCT_CATALOG_TIMEOUT', async () => {
      const res = await get('/api/v1/catalog/products/producto-error-504-mock').expect(504);
      expect(res.body.error.code).toBe('PRODUCT_CATALOG_TIMEOUT');
    });

    it('slug con formato válido pero inexistente retorna 404 (sin fallback)', async () => {
      const res = await get('/api/v1/catalog/products/un-slug-valido-123').expect(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_AVAILABLE');
    });

    it('producto-demostracion-99 (fuera del listado de 32) retorna 404', async () => {
      const res = await get('/api/v1/catalog/products/producto-demostracion-99').expect(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_AVAILABLE');
    });

    it('cada tarjeta del listado tiene su ficha: producto-demostracion-5', async () => {
      const res = await get('/api/v1/catalog/products/producto-demostracion-5').expect(200);
      expect(res.body.data.slug).toBe('producto-demostracion-5');
      expect(res.body.data.productId).toBe('mock-product-5');
      expect(res.body.data.name).toBe('Zapatillas de running 05');
      expect(res.body.meta.source).toBe('MOCK');
    });
  });
});
