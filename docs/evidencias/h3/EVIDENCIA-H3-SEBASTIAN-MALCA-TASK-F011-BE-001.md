# Evidencia H3 — Sebastian Malca — TASK-F011-BE-001 (MOCK)

**Fecha:** 2026-10-15
**Repositorio / rama / commit:** G1-Marketplace-Backend / feat/h3-f011-f015-detalle-de-producto / (hash final a confirmar tras push)
**Specs leídas:** F-011 v0.1.0 · contrato-api/F-011 v0.1.0
**Endpoint expuesto:** GET /api/v1/catalog/products/:slug

## Trabajo manual realizado

- Revisión y definición de la estructura de carpetas del módulo `catalog`
- Implementación del endpoint BFF con validación de slug
- Creación de DTOs, fixtures MOCK, servicio y controlador
- Integración en el servidor HTTP existente (`server.js`)
- Ejecución y validación de los 5 tests obligatorios + tests adicionales
- Alineación de códigos de error con el contrato API F-011 v1 (`INVALID_PRODUCT_SLUG`, `PRODUCT_CATALOG_INVALID_RESPONSE`; 504 `PRODUCT_CATALOG_TIMEOUT` preparado para post I-01) — verificado contra `SPECS/contrato-api/F-011-detalle-producto.md`
- Coherencia con el frontend (`G1-Marketplace-Frontend`, proxy `/api/catalog/...`): slug especial `producto-error-504-mock` → 504 añadido (espejo del adapter FE) y header `X-Catalog-Source: MOCK` en todas las respuestas del endpoint

## IA utilizada

- **Herramienta:** Antigravity (Claude Opus)
- **Propósito:** Generación de código boilerplate para DTOs, fixtures, servicio, controlador y tests
- **Resumen del prompt:** "Avanzar la checklist de Sebastian Malca implementando los pasos del 1 al 7 con http nativo de Node.js"

## Código generado por IA

**Archivos generados:**
- `src/catalog/dto/product-detail-response.dto.js`
- `src/catalog/fixtures/product-detail.fixture.js`
- `src/catalog/services/product-detail.service.js`
- `src/catalog/controllers/product-detail.controller.js`
- `tests/catalog/product-detail.controller.spec.js`

**Modificaciones a archivos existentes:**
- `src/server.js` — integración del controlador de catálogo
- `.env.example` — adición de variable `BFF_MODE`
- `package.json` — adición de script `test` y dependencias `jest`/`supertest`

**Qué revisé y corregí manualmente:** (completar por Sebastian)

## Pruebas ejecutadas

- Comando: `npm run test`
- RC-F-011-BE-01: **PASS** — Slug inválido retorna 400
- RC-F-011-BE-02: **PASS** — Producto MOCK encontrado retorna 200 (meta.source='MOCK')
- RC-F-011-BE-03: **PASS** — Slug de producto inexistente retorna 404
- RC-F-011-BE-04: **PASS** — Slug de error de servicio retorna 503
- RC-F-011-BE-05: **PASS** — Respuesta no contiene campos comerciales (price, stock, variants undefined)
- Tests adicionales: **PASS** — producto sin specs, 504 (timeout), header `X-Catalog-Source`, slug válido con guiones
- **Total: 13 passed, 0 failed**
- Etiqueta: **MOCK**

## Capturas / log sanitizado

```
PASS tests/catalog/product-detail.controller.spec.js
  RC-F-011-BE-01 — Slug inválido retorna 400
    √ retorna 400 cuando el slug tiene formato inválido (mayúsculas)
    √ retorna 400 cuando el slug tiene caracteres especiales
    √ retorna 400 cuando el slug está vacío
    √ retorna 400 cuando el slug excede 120 caracteres
  RC-F-011-BE-02 — Producto MOCK encontrado retorna 200
    √ retorna 200 con datos MOCK para slug válido
    √ la respuesta tiene la estructura correcta del DTO
  RC-F-011-BE-03 — Slug de producto inexistente retorna 404
    √ retorna 404 para slug de producto no existente
  RC-F-011-BE-04 — Slug de error de servicio retorna 503
    √ retorna 503 cuando el servicio de catálogo no está disponible
  RC-F-011-BE-05 — Respuesta no contiene campos comerciales
    √ no incluye precio, stock ni variantes en la respuesta MOCK
  Tests adicionales
    √ producto sin specs retorna array vacío de technicalSpecifications
    √ producto con error de timeout retorna 504 PRODUCT_CATALOG_TIMEOUT
    √ las respuestas incluyen el header X-Catalog-Source: MOCK
    √ slug válido con guiones funciona correctamente

Test Suites: 1 passed, 1 total
Tests:       13 passed, 13 total
```

## Gates que bloquean integración REAL

- **I-01:** ruta/auth/payload de Productos y Ofertas sin homologar
- Sin cierre de I-01 → `TASK-F011-INT-001` permanece **Bloqueado**

## Revisor

Giuliano Macchiavello — **PR:** (completar con enlace del PR)
