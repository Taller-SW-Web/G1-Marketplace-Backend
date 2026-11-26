# Trazabilidad H4 — F-012…F-015 (MOCK)

**Autor:** Sebastian Malca
**Revisor:** Giuliano Macchiavello (`@GiulianoMaPe`)
**Fecha:** 2026-10-26
**Corte de specs:** `G1-Marketplace-SPECS@46005a4` (`main`)
**Implementación:** Backend PR #232 · Frontend PR #107 (rama `feat/h4-f012-f015-detalle-comercial`)

> Esta trazabilidad documenta el corte **MOCK**. No declara terminada la
> funcionalidad: `TASK-F012..F015-INT-001` siguen bloqueadas por **I-01** y por
> los acuerdos de la sección 5.

## 1. Fuentes de verdad

| Artefacto | Ruta |
|---|---|
| Alcance H4 | [`plan/ALCANCE-H4-PRODUCTOS-SEGURIDAD.md`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/plan/ALCANCE-H4-PRODUCTOS-SEGURIDAD.md) |
| Vista | [`SPECS/ui/vistas/V-007-ficha-producto.md`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/ui/vistas/V-007-ficha-producto.md) (v0.1.0, En revisión, Figma **pendiente**) |
| Sistema de diseño | [`SPECS/ui/DS-001-sistema-diseno-marketplace.md`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/ui/DS-001-sistema-diseno-marketplace.md) v0.2.0 |
| Arquitectura | [`SPECS/componentes-react/ARQUITECTURA-REACT.md`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/componentes-react/ARQUITECTURA-REACT.md) |

Funciones: [F-012 funcional](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/funcional/F-012-precio-oferta-descuento.md) · [UI](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/ui/F-012-precio-oferta-descuento.md) · [contrato](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-012-precio-oferta-descuento.md) · [componentes](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/componentes-react/F-012-precio-oferta-descuento.md) (mismo patrón para F-013, F-014 y F-015 sustituyendo el ID en la ruta).

## 2. Matriz specs ↔ implementación ↔ pruebas

| Funcional | Endpoint | Backend | Frontend | Pruebas |
|---|---|---|---|---|
| F-012 | `GET /api/v1/catalog/products/{slug}/price?sku=` | `src/catalog/product-price.{controller,service,dto,errors,fixture}.ts` | `types/product-price.types.ts`, `services/product-price.service.ts`, `hooks/useProductPrice.ts`, `components/ProductPriceRegion.tsx`, `components/PriceDisplay.tsx`, `money.ts` | unit 14 · e2e BE 8 · componentes FE 5 · E2E FE 4 (compartido) |
| F-013 | `GET /api/v1/catalog/products/{slug}/variants` | `src/catalog/product-variants.{controller,service,dto,errors,fixture}.ts` | `types/product-variants.types.ts`, `services/product-variants.service.ts`, `hooks/useProductVariants.ts`, `components/ProductVariantsRegion.tsx`, `components/VariantSelector.tsx`, `components/SelectionSummary.tsx` | unit 6 · e2e BE 3 · componentes FE 6 · E2E FE 4 (compartido) |
| F-014 | `GET /api/v1/catalog/products/{slug}/availability?sku=` | `src/catalog/product-availability.{controller,service,dto,errors,fixture}.ts` | `types/product-availability.types.ts`, `services/product-availability.service.ts`, `hooks/useProductAvailability.ts`, `components/AvailabilityRegion.tsx` | unit 6 · e2e BE 4 · componentes FE 3 · E2E FE 4 (compartido) |
| F-015 | `GET /api/v1/catalog/products/{slug}/recommendations` | `src/catalog/product-recommendations.{controller,service,dto,fixture}.ts` | `types/product-recommendations.types.ts`, `services/product-recommendations.service.ts`, `hooks/useRelatedProducts.ts`, `components/RelatedProductsRegion.tsx`, `components/RelatedProducts.tsx` | unit 5 · e2e BE 4 · componentes FE 4 · E2E FE 4 (compartido) |
| Integración | — | `product-commerce.module.ts`, `catalog-source.interceptor.ts`, `bff-catalog.exception.ts` | `components/ProductCommerce.tsx`, `ProductDetailContainer.tsx`, `src/app/api/catalog/bff-proxy.ts` | componentes 227/227 · Playwright 10/10 |

Evidencias detalladas:

- Implementación BE: [`F012-F015-MOCK.md`](F012-F015-MOCK.md)
- Implementación FE: [F012-F015-MOCK.md (Frontend)](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/feat/h4-f012-f015-detalle-comercial/docs/evidencias/H4/sebastian-malca/F012-F015-MOCK.md)
- QA funcional: [F012-F015-QA-FUNCIONAL.md (Frontend)](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/feat/h4-f012-f015-detalle-comercial/docs/evidencias/H4/sebastian-malca/F012-F015-QA-FUNCIONAL.md)
- QA seguridad: [`F012-F015-QA-SEGURIDAD.md`](F012-F015-QA-SEGURIDAD.md) + [`seguridad/summary-F012-F015.json`](seguridad/summary-F012-F015.json)

## 3. Operación: errores publicados

Todos los errores usan el sobre `application/problem+json` (RFC 9457) con `type`, `title`, `status`, `code`, `instance` y `requestId`.

| Funcional | HTTP | `code` | Comportamiento en la UI |
|---|---|---|---|
| F-012 | 409 | `PRODUCT_VARIANT_SELECTION_REQUIRED` | «Selecciona una opción para ver el precio» |
| F-012 | 409 | `SKU_NOT_BELONG_TO_PRODUCT` | error de precio + reintento; no hereda importe |
| F-012 | 422 | `PRICE_NOT_AVAILABLE` | «Precio no disponible por el momento» |
| F-012 | 502/503/504 | `PRICING_INVALID_RESPONSE` / `PRICING_UNAVAILABLE` / `PRICING_TIMEOUT` | error de región + reintento |
| F-013 | 400 | `INVALID_PRODUCT_SLUG` | ficha no disponible |
| F-013 | 404 | `PRODUCT_NOT_AVAILABLE` | ficha no disponible |
| F-013 | 502 | `CATALOG_INVALID_RESPONSE` | no se habilita el selector; reintento |
| F-013 | 503/504 | `CATALOG_UNAVAILABLE` / `CATALOG_TIMEOUT` | reintento de opciones |
| F-014 | 409 | `PRODUCT_VARIANT_SELECTION_REQUIRED` / `SKU_NOT_BELONG_TO_PRODUCT` | sin estado ficticio; espera selección |
| F-014 | 502/503/504 | `INVENTORY_INVALID_RESPONSE` / `INVENTORY_UNAVAILABLE` / `INVENTORY_TIMEOUT` | error explícito, **nunca** «Agotado» |
| F-015 | 400/502 | `INVALID_PRODUCT_SLUG` / `RECOMMENDATIONS_INVALID_RESPONSE` | región omitida (degradación) |

Guardas transversales: límite de slug (≤ 120, patrón canónico), sin campos de
stock/cupón/costos en las respuestas, `Cache-Control: public, max-age=30` en
disponibilidad, y `503` en todas las rutas cuando `CATALOG_SOURCE != mock`
(gate de I-01).

## 4. Operación local (MOCK)

```
# Backend
npx prisma generate
npm run typecheck && npm run test:unit
npm run start:dev            # CATALOG_SOURCE=mock, BFF_MODE=mock

# Frontend
npm run dev                  # MARKETPLACE_API_URL=http://127.0.0.1:10100
```

Productos de demostración: `zapatillas-running-aero-x` (simple con oferta),
`producto-variable-mock` (color × talla), `producto-demostracion-1..32`
(disponibilidad alternada), `producto-sin-relacionados-mock`,
`producto-error-recomendaciones-mock`.

## 5. Registro de decisiones

| ID | Tema | Estado | Detalle |
|---|---|---|---|
| D-1 | Estados de disponibilidad | **Pendiente (G-G6-COMPAT)** | G1 ya aceptó el cuarto estado en M-01 (`INDETERMINADO`→`UNDETERMINED`, HTTP 200, nunca agotado). La spec vigente publica tres; se implementaron tres y el cuarto se rechaza de forma defensiva (502). Propuesta de specs en [SPECS #12](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/12), pendiente de conformidad G6 y de Giuliano. |
| D-2 | Registro de SKU | **Pendiente (G-SKU)** | Registro local en `src/catalog/mock-sku.ts` (`PRD-MOCK-001 → SKU-MOCK-001`, demo 1..32 → `002..033`, variable → `VAR-1..3`). No sustituye el contrato externo. |
| D-3 | PR #23 y SKU de carrito | **Pendiente de alineación** | PR #23 mapea `mock-product-1..32 → SKU-MOCK-001..032`, lo que colisiona con `SKU-MOCK-001` de `PRD-MOCK-001`. Debe adoptar el registro de D-2 antes de integrar F-016. |
| D-4 | Fuente de recomendaciones | **Pendiente (G6)** | El MOCK demuestra la forma del contrato; falta definir origen, permisos y frecuencia. |
| D-5 | Etiquetado UX de relacionados | **Pendiente (UX)** | El contrato no incluye marca ni etiqueta; la UI no muestra «Cross-sell»/«Upsell» hasta que se defina. |
| D-6 | Propiedad de estilos | **Pendiente (DS-001)** | Precio/variantes/disponibilidad usan tokens existentes en `globals.css`; falta decidir si migran al sistema de diseño. |
| D-7 | Figma | **Bloqueado externo** | V-007 y las specs UI F-012…F-015 registran «Enlace de Figma: Pendiente». No se inventan enlaces; la revisión visual no puede cerrarse sin prototipo. |
| D-8 | Gate de seguridad del backend | **Propuesta** | El repo Backend no tiene workflow SAST/SCA/secrets; los scans se ejecutaron localmente con las versiones del gate del Frontend. Se propone portar el workflow. |

### Decisiones ya resueltas en el corte

- **Arquitectura FE:** `ProductCommerce` es el único contenedor con hooks; las regiones son presentacionales; F-015 se carga aparte para no bloquear la ficha.
- **Descuento:** siempre derivado de importes autoritativos del BFF; el cliente no recalcula reglas de Pricing.
- **Disponibilidad:** un error nunca se presenta como agotado; sin SKU no se consulta.
- **Contrato F-013:** sin stock ni precio; la variante agotada sigue siendo seleccionable.
- **Contrato F-015:** máximo 8, sin origen ni duplicados, `price: null` nunca equivale a 0, fallo técnico → sección omitida.
