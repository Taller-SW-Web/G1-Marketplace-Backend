# TASK-TRANS-S02-DOC-001 — Hub de trazabilidad H4

**Responsable:** Sebastian Malca · **Revisor:** Jim Segovia
**Fecha:** 2026-10-26
**Objetivo:** enlazar diseño de APIs, specs, código, contratos externos, pruebas, URL de demo y evidencias CI/CD.
**Estado:** **parcial y honesto**. Enlaza lo que existe; marca como pendientes los artefactos que dependen de otros owners o de un entorno desplegado. No declara gates cerrados ni funcionalidad REAL.

## 1. Cortes de referencia

| Repo | Corte | Rol |
|---|---|---|
| [`G1-Marketplace-SPECS`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS) | `main@46005a4` | specs y plan vigentes |
| [`G1-Marketplace-Backend`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend) | `develop@9dc5cfd` · rama `feat/h4-f012-f015-detalle-comercial@a9aee76` | BFF, OpenAPI, pruebas |
| [`G1-Marketplace-Frontend`](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend) | `develop@e448a20` · rama `feat/h4-f012-f015-detalle-comercial@9892459` | UI Next.js, proxy BFF, pruebas |

PRs abiertos de este corte:

| PR | Contenido | CI |
|---|---|---|
| Backend #232 | endpoints comerciales F-012…F-015 (MOCK) | [run 40440125373](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/40440125373) ✅ |
| Frontend #107 | región comercial F-012…F-015 + fix `happy-dom` | [run 40439995253](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/40439995253) ✅ |

## 2. Diseño de APIs y contratos

| Artefacto | Ubicación | Estado |
|---|---|---|
| OpenAPI BFF (H3: carrito, favoritos, salud) | [`docs/contratos/openapi-h3.json`](../../../contratos/openapi-h3.json) (7 rutas, OpenAPI 3.0.3, generado por `scripts/openapi.ts`) | **parcial**: no incluye catálogo (F-006…F-015) ni cuenta (F-001…F-005) |
| Contrato de catálogo F-011 | [SPECS/contrato-api/F-011](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-011-detalle-producto.md) | implementado en MOCK |
| Contratos F-012…F-015 | [F-012](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-012-precio-oferta-descuento.md) · [F-013](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-013-seleccion-atributos-variante.md) · [F-014](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md) · [F-015](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-015-productos-relacionados.md) | implementados en MOCK (PR #232) |
| Contratos externos G6 (Productos y Ofertas / Inventario) | pendientes de grant y homologación | **bloqueado (I-01)** |
| Contrato externo G7 (identidad) | según `TASK-TRANS-S02-AUTH-001` | **en progreso (otro owner)** |
| Versión/versionado del OpenAPI | `TASK-TRANS-S02-API-001` (Leonidas) | **pendiente**; este hub no lo sustituye |

### Validación ejecutada sobre el OpenAPI actual (insumo de `TASK-TRANS-S02-API-002`)

| Check | Comando | Resultado |
|---|---|---|
| Estructura del documento | `npx @apidevtools/swagger-cli@4.0.4 validate docs/contratos/openapi-h3.json` | **válido** (OpenAPI 3.0.3) |
| Ejemplos contra su esquema | script ad-hoc con Ajv 8.18.0 (traduce `nullable` de OAS 3.0 y resuelve `$ref` locales) | **44/44** ejemplos válidos, 0 desajustes |
| Cobertura de rutas | controladores Nest (`@Controller` + `@Get/@Post/…`) vs `paths` del contrato | **7 rutas documentadas de ~31 handlers** (~23 %) |

Riesgo abierto: `TASK-TRANS-S02-API-002` no puede cerrarse mientras el OpenAPI no cubra catálogo y cuenta y cada owner no aporte casos positivos/negativos. Rutas implementadas y **no documentadas**: cuenta (5), auth (6), catálogo `home`/`products` y ficha comercial F-011…F-015 (7), checkout (7), pedidos (1). El validador de ejemplos fue ad-hoc: no se incorporó al repo para no duplicar el trabajo de `API-001`; se recomienda formalizarlo junto con el versionado del contrato.

## 3. Specs ↔ código ↔ pruebas

| Funcional | Spec | Código | Pruebas |
|---|---|---|---|
| F-011 ficha | [funcional](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/funcional/F-011-detalle-producto.md) · [contrato](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-011-detalle-producto.md) | `src/catalog/product-detail.*` (BE) · `src/features/catalog/**` (FE) | BE e2e + FE componentes/E2E |
| F-012 precio | [contrato](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-012-precio-oferta-descuento.md) | `src/catalog/product-price.*` · `product-price.service.ts`, `useProductPrice`, `ProductPriceRegion` | 14 unit · 8 e2e BE · 5 componentes · E2E FE |
| F-013 variantes | [contrato](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-013-seleccion-atributos-variante.md) | `src/catalog/product-variants.*` · `product-variants.service.ts`, `useProductVariants`, `VariantSelector` | 6 unit · 3 e2e BE · 6 componentes · E2E FE |
| F-014 disponibilidad | [contrato](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md) | `src/catalog/product-availability.*` · `product-availability.service.ts`, `useProductAvailability`, `AvailabilityRegion` | 6 unit · 4 e2e BE · 3 componentes · E2E FE |
| F-015 relacionados | [contrato](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-015-productos-relacionados.md) | `src/catalog/product-recommendations.*` · `product-recommendations.service.ts`, `useRelatedProducts`, `RelatedProducts` | 5 unit · 4 e2e BE · 4 componentes · E2E FE |
| F-016…F-021 carrito/checkout | specs del plan | `src/cart/**` (BE) · `src/features/cart/**`, `features/checkout/**` (FE) | suites propias de cada owner (no auditadas aquí) |
| F-036…F-039 favoritos | specs del plan | `src/wishlist/**` (BE) · `src/features/wishlist/**` (FE) | suites propias de cada owner |

Trazabilidad ampliada de este corte: [`F012-F015-TRAZABILIDAD.md`](F012-F015-TRAZABILIDAD.md).

## 4. Pruebas ejecutadas y evidencias

| Suite | Comando | Último resultado |
|---|---|---|
| BE unitarias | `npm run test:unit` | 179/179 ✅ |
| BE e2e comerciales | `npx jest --config ./test/jest-e2e.json --runInBand test/product-commerce.e2e-spec.ts` | 29/29 ✅ |
| BE CI (lint, e2e, build, postgres 22/24) | workflow `backend-ci` | ✅ run 40440125373 |
| FE componentes | `npm run test:components` | 227/227 ✅ |
| FE servidor/proxy | `npm run test:server` | 73/73 ✅ |
| FE E2E catálogo/ficha | `playwright test tests/product-commerce.e2e.spec.ts tests/product-detail.e2e.spec.ts` | 10/10 ✅ (local) |
| FE CI (lint, componentes, servidor, build, typecheck, teclado, seguridad) | workflow `web` | ✅ run 40439995253 |
| Seguridad (SAST/SCA/secrets) | ver [`F012-F015-QA-SEGURIDAD.md`](F012-F015-QA-SEGURIDAD.md) | 0 hallazgos; DAST pendiente |

Evidencias por función: [implementación](F012-F015-MOCK.md) · [QA seguridad](F012-F015-QA-SEGURIDAD.md) · [QA funcional (FE)](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/feat/h4-f012-f015-detalle-comercial/docs/evidencias/H4/sebastian-malca/F012-F015-QA-FUNCIONAL.md).

## 5. URL de demo

**Pendiente.** No existe despliegue de este corte; `TASK-TRANS-S02-OPS-003` (Fernando) no ha publicado URLs/SHAs de runtime. No se inventa una URL.

Reproducción local (MOCK):

```
# Backend
npx prisma generate && npm run start:dev      # CATALOG_SOURCE=mock, BFF_MODE=mock

# Frontend
npm run dev                                   # MARKETPLACE_API_URL=http://127.0.0.1:10100
# http://127.0.0.1:3000/productos/zapatillas-running-aero-x
# http://127.0.0.1:3000/productos/producto-variable-mock
```

## 6. Brechas y bloqueos

| # | Brecha | Owner | Impacto |
|---|---|---|---|
| 1 | OpenAPI sin rutas de catálogo ni cuenta | Leonidas (`API-001`) | impide cerrar API-002 y la validación de ejemplos |
| 2 | Contratos G6/G7 no homologados; I-01 abierto | Leonidas / Jim | todas las pruebas son MOCK |
| 3 | Sin URL de demo ni despliegue | Fernando (`OPS-003`) | no hay prueba en despliegue |
| 4 | Figma de V-007 y F-012…F-015 pendiente | Fernando / diseño | revisión visual no cerrable |
| 5 | Gate SAST/SCA/secrets no existe en el CI del Backend | Andres / Leonidas (`OPS-002`) | el backend se valida con el toolchain del Frontend de forma manual |
| 6 | Casos de consumidor de carrito/cuenta no aportados formalmente por cada owner | owners F-016…F-021, F-001…F-005 | API-002 incompleto |

## 7. Criterio de cierre de esta tarea

- [x] Enlaces a specs, código, contratos y pruebas del corte.
- [x] Evidencias CI/CD con URL de run y SHA.
- [x] Brechas y bloqueos explícitos, sin declarar REAL ni demo.
- [ ] URL de demo (bloqueada por OPS-003).
- [ ] OpenAPI completo/versionado (bloqueado por API-001).
- [ ] Revisión de **Jim Segovia**.
