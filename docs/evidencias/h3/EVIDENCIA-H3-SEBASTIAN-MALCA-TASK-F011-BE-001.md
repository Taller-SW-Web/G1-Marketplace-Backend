# Evidencia H3 — Sebastian Malca — TASK-F011-BE-001 (MOCK)

**Fecha:** 2026-10-15 · **Migración al baseline NestJS:** 2026-10-16
**Repositorio / rama / commit:** G1-Marketplace-Backend / feat/h3-f011-f015-detalle-de-producto / (hash final a confirmar tras push)
**Specs leídas:** F-011 v0.1.0 · contrato-api/F-011 v0.1.0
**Endpoint expuesto:** GET /api/v1/catalog/products/:slug

## Trabajo manual realizado

- Revisión y definición de la estructura del módulo `catalog`
- Implementación del endpoint BFF con validación de slug
- Creación de DTOs, fixtures MOCK, servicio y controlador
- **Migración al baseline NestJS de `develop` (PR #9):** port de los módulos `node:http` a `ProductDetailModule` (controller/service/dto/fixture/errors en TypeScript) registrado en `src/app.module.ts`; `src/server.js` eliminado según el baseline; resolución de conflictos del merge (`package.json`, `.env.example`)
- Ejecución y validación de los 5 tests obligatorios + tests adicionales
- Alineación de códigos de error con el contrato API F-011 v1 (`INVALID_PRODUCT_SLUG`, `PRODUCT_CATALOG_INVALID_RESPONSE`; 504 `PRODUCT_CATALOG_TIMEOUT` preparado para post I-01) — verificado contra `SPECS/contrato-api/F-011-detalle-producto.md`
- Coherencia con el frontend (`G1-Marketplace-Frontend`, proxy `/api/catalog/...`): slug especial `producto-error-504-mock` → 504 añadido (espejo del adapter FE) y header `X-Catalog-Source: MOCK` en todas las respuestas del endpoint
- Guardia de contrato en el DTO (`isProductDetailResponse`): valida estructura, medios HTTPS (API-CA-F011-04) y **rechaza campos comerciales excluidos** (price/stock/variants/sku/coupon) → 502 si falla

## IA utilizada

- **Herramienta:** Antigravity (Claude Opus)
- **Propósito:** Generación de código boilerplate para DTOs, fixtures, servicio, controlador y tests
- **Resumen del prompt:** "Avanzar la checklist de Sebastian Malca implementando los pasos del 1 al 7 con http nativo de Node.js"

## Código generado por IA

**Archivos generados (tras la migración a NestJS/TypeScript):**
- `src/catalog/product-detail.dto.ts`
- `src/catalog/product-detail.fixture.ts`
- `src/catalog/product-detail.service.ts`
- `src/catalog/product-detail.controller.ts`
- `src/catalog/product-detail.errors.ts`
- `src/catalog/product-detail.module.ts`
- `src/catalog/product-detail.service.spec.ts` (unit) · `test/product-detail.e2e-spec.ts` (e2e)

**Modificaciones a archivos existentes:**
- `src/app.module.ts` — registro de `ProductDetailModule`
- `.env.example` — variable `BFF_MODE` (conservada en el merge con el baseline)

**Qué revisé y corregí manualmente:** (completar por Sebastian)

## Pruebas ejecutadas

- Comandos (baseline NestJS): `npm run lint` (tsc --noEmit) · `npm run build` · `npm test` · `npm run test:e2e`
- RC-F-011-BE-01: **PASS** — Slug inválido retorna 400 (3 casos; la ruta sin slug ahora retorna 404 del baseline — el listado `/products` es F-006/F-007)
- RC-F-011-BE-02: **PASS** — Producto MOCK encontrado retorna 200 (meta.source='MOCK', UTF-8, header `X-Catalog-Source`)
- RC-F-011-BE-03: **PASS** — Producto inexistente retorna 404 (y conserva `X-Catalog-Source` en el error)
- RC-F-011-BE-04: **PASS** — Slug de error de servicio retorna 503
- RC-F-011-BE-05: **PASS** — Respuesta no contiene campos comerciales (price, stock, variants undefined — además bloqueados por la guardia del DTO → 502)
- Tests adicionales: **PASS** — producto sin specs, 504 (timeout), slug válido con guiones
- **Unit `npm test`: 15 passed, 0 failed** (13 de F-011 + 2 baseline) · **E2E `npm run test:e2e`: 21 passed, 0 failed** (15 de F-011 + 6 baseline)
- **Total: 36 passed, 0 failed** entre ambos runners
- Etiqueta: **MOCK**

## Capturas / log sanitizado

```
> npm run lint          → tsc --noEmit                    0 errores
> npm run build         → prisma generate + tsc           OK
> npm test              → Test Suites: 2 passed | Tests: 15 passed, 15 total
> npm run test:e2e      → Test Suites: 2 passed | Tests: 21 passed, 21 total

E2E F-011 (test/product-detail.e2e-spec.ts):
  RC-F-011-BE-01 — Slug inválido retorna 400
    √ 400 formato inválido (mayúsculas) → INVALID_PRODUCT_SLUG
    √ 400 caracteres especiales → INVALID_PRODUCT_SLUG
    √ 400 excede 120 caracteres → INVALID_PRODUCT_SLUG
    √ 404 ruta sin slug (listado F-006/F-007)
  RC-F-011-BE-02 — Producto MOCK encontrado retorna 200
    √ 200 con datos MOCK (productId, meta.source)
    √ estructura del contrato F-011
    √ UTF-8 de la descripción
    √ header X-Catalog-Source: MOCK
  RC-F-011-BE-03 — 404 PRODUCT_NOT_AVAILABLE (+ header en error)
  RC-F-011-BE-04 — 503 PRODUCT_CATALOG_UNAVAILABLE
  RC-F-011-BE-05 — sin price/stock/variants
  Adicionales — sin-specs 200 · 504 PRODUCT_CATALOG_TIMEOUT · slug con guiones 200

Smoke (dist/main.js, BFF_MODE=mock):
  200 zapatillas-running-aero-x   src=MOCK
  404 producto-no-existente-mock  PRODUCT_NOT_AVAILABLE  src=MOCK
  504 producto-error-504-mock     PRODUCT_CATALOG_TIMEOUT src=MOCK
  400 SLUG_INVALIDO!              INVALID_PRODUCT_SLUG   src=MOCK
```

## Gates que bloquean integración REAL

- **I-01:** ruta/auth/payload de Productos y Ofertas sin homologar
- Sin cierre de I-01 → `TASK-F011-INT-001` permanece **Bloqueado**

## Revisor

Giuliano Macchiavello — **PR:** (completar con enlace del PR)
