# Evidencia H3 — Sebastian Malca — TASK-F011-BE-001 (MOCK)

**Fecha:** 2026-10-15 · **Migración al baseline NestJS:** 2026-10-16 · **Cierre de feedback del revisor:** 2026-10-17
**Repositorio / rama / commit:** G1-Marketplace-Backend / feat/h3-f011-f015-detalle-de-producto / `cac413c`
**PR:** [#16 → develop](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/16) · revisor solicitado: Giuliano MaPe · **aprobación pendiente**
**CI:** [H3 F-011 Backend — run 39003832390 ✅](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/39003832390) (lint · 19 unit · 32 e2e · build · postgres)
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
- **Feedback del revisor (2026-10-17):** (1) fixture ampliado a los **32 productos del listado F-006/F-007** (`producto-demostracion-1..32`) como **espejo exacto de `src/catalog/fixtures.ts`** de la rama `feat/s1-f006-f007-catalogo` (PR #11: mismo `productId`, `slug` y `nombre`) para que **cada tarjeta abra LA ficha que le corresponde**; (2) lookup por slug conocido **sin fallback** — antes cualquier slug válido caía al fixture por defecto (200), ahora responde **404 `PRODUCT_NOT_AVAILABLE`**; (3) la prueba **Frontend → BFF MOCK** quedó reproducible desde el FE (`npm run test:e2e` arranca este BFF en MOCK vía `dist/main.js` y valida aviso + errores acordados)

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
- RC-F-011-BE-03: **PASS** — Producto inexistente retorna 404 (sin fallback: slug desconocido o fuera del listado → `PRODUCT_NOT_AVAILABLE`; conserva `X-Catalog-Source` en el error)
- RC-F-011-BE-04: **PASS** — Slug de error de servicio retorna 503
- RC-F-011-BE-05: **PASS** — Respuesta no contiene campos comerciales (price, stock, variants undefined — además bloqueados por la guardia del DTO → 502)
- Tests adicionales: **PASS** — producto sin specs, 504 (timeout), **espejo del listado** (`producto-demostracion-5` → 200 con «Zapatillas de running 05»), `producto-demostracion-99` y `un-slug-valido-123` → **404** (sin fallback)
- **Unit `npm test`: 19 passed, 0 failed** (3 suites) · **E2E `npm run test:e2e`: 32 passed, 0 failed** (3 suites, incluye cart F-016/F-019 fusionado)
- **Total: 51 passed, 0 failed** entre ambos runners
- Etiqueta: **MOCK**

## Capturas / log sanitizado

```
> npm run lint          → tsc --noEmit                    0 errores
> npm run build         → prisma generate + tsc           OK
> npm test              → Test Suites: 3 passed | Tests: 19 passed, 19 total
> npm run test:e2e      → Test Suites: 3 passed | Tests: 32 passed, 32 total

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
  Adicionales — sin-specs 200 · 504 PRODUCT_CATALOG_TIMEOUT ·
                un-slug-valido-123 → 404 (sin fallback) ·
                producto-demostracion-99 → 404 ·
                producto-demostracion-5 → 200 «Zapatillas de running 05»

Smoke (dist/main.js, BFF_MODE=mock):
  200 zapatillas-running-aero-x   src=MOCK
  200 producto-demostracion-5     «Zapatillas de running 05» src=MOCK
  404 producto-demostracion-99    PRODUCT_NOT_AVAILABLE  src=MOCK
  404 producto-no-existente-mock  PRODUCT_NOT_AVAILABLE  src=MOCK
  504 producto-error-504-mock     PRODUCT_CATALOG_TIMEOUT src=MOCK
  400 SLUG_INVALIDO!              INVALID_PRODUCT_SLUG   src=MOCK
```

## Gates que bloquean integración REAL

- **I-01:** ruta/auth/payload de Productos y Ofertas sin homologar
- Sin cierre de I-01 → `TASK-F011-INT-001` permanece **Bloqueado**

## Revisor

Giuliano Macchiavello — **PR:** [#16](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/16) (revisor solicitado vía API; **aprobación pendiente**)

> **Coordinación (pendiente de publicar):** el fixture espejo de los 32 productos duplica `src/catalog/fixtures.ts` del PR #11 (F-006/F-007) — mantener sincronizados al fusionar; los conflictos de integración con el revisor (quién fusiona primero `app.module.ts`) se coordinan fuera del PR.
