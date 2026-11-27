# #293 — Contract tests de Productos y Ofertas

**Estado: artefactos existentes listos para integrar; falta merge en el branch de entrega.** La [matriz de PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/354) registra OpenAPI G6 `0.7.0-rc.3` y snapshot offline (6/6). La [PR #358](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/358) agrega adaptadores aislados de precio y disponibilidad con doble HTTP (10/10). Ambas tienen CI exitoso y aprobación; apuntan a `main`, no están fusionadas en `develop` y no acreditan integración REAL.

## Evidencia existente

| Alcance | Prueba / contrato | Qué acredita | Límite |
|---|---|---|---|
| Contrato público del BFF (F-011–F-015) | [`test/openapi-contract.e2e-spec.ts`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/test/openapi-contract.e2e-spec.ts); comando `npm run test:contract`; [`product-detail-h4.openapi.yaml`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/contratos/product-detail-h4.openapi.yaml) | Valida ejemplos de los contratos versionados y respuestas BFF 200/400/404/409 mediante JSON Schema; el BFF se inicia en `BFF_MODE=mock` | Es contrato de salida del Marketplace, no el OpenAPI proveedor de Productos/Ofertas |
| Adaptador G6 Productos | [`test/catalog-g6-contract.e2e-spec.ts`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/test/catalog-g6-contract.e2e-spec.ts); comando `npm run test:g6:contract` | Ejercita categorías y catálogo a través del adaptador HTTP; incluye mapeo, correlación, errores 401/403/429/503, timeout, redirección, entrada inválida y lista vacía | Servidor HTTP local, token sintético y respuestas controladas; no llama al G6 real. Pin observado: OpenAPI `0.6.0-rc.1`, revisión Docs `c36bd9a`, blob `f64bfe9a` |
| OpenAPI proveedor G6 Productos y Ofertas | [Matriz de PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/aeac35ff99d8bf5a685c6ce43cb5fd2fec8add5e/docs/evidencias/H5/MATRICES-TASK-H5-291-299.md); [fuente G6 `openapi.yaml`](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/40524e96c6973f84d74160076781702fe2a3da19/contratos/http/openapi.yaml) | La matriz reporta G6 `0.7.0-rc.3`, snapshot y suite offline 6/6; el hash del blob es `e094988f0f0d92a7a4241c1dc30a5e50d9ff709a` | El snapshot/test se publica en PR #354; verificar ese artefacto tras merge. Pin antiguo [PR #355](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/355) es `0.6.0-rc.1`, no confundirlo con el corte H5 vigente |
| Productos: precio/disponibilidad | [PR #358](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/358), adaptadores `g6-commerce.adapter` y pruebas 10/10 | Valida mapeos, shape, fallos y `X-Correlation-Id` con doble HTTP | LOCAL/MOCK; adapters desconectados de `ProductPriceService`/`ProductAvailabilityService`, gates siguen cerrados |
| Ofertas | `POST /promociones/evaluar` en el OpenAPI G6 fijado por la matriz #354 | La operación está en el contrato proveedor; separar evaluación de promociones de la fachada local de precio | La matriz documenta el contrato, pero no un recorrido REAL de oferta durante la compra |
| OpenAPI fijados de G5 | [`test/g5-pinned-openapi.spec.ts`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/test/g5-pinned-openapi.spec.ts), snapshots y [`manifest.json`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/contratos/fixtures/g5-pinned/manifest.json) | Verifica procedencia, versiones, hashes y superficie offline de Ventas M1 `1.10.0` y Postventa M2 `1.6.0` | Son Ventas/Postventa; no son el OpenAPI de Ofertas |

## Brechas contra #293

| Operación requerida | Evidencia de contrato proveedor | Estado |
|---|---|---|
| Productos: catálogo/detalle | Matriz #354 y suites G6 locales existentes | Pruebas LOCAL/HTTP doble; no G6 desplegado |
| Productos: precio | Adaptador offline de PR #358, 10/10 | Aprobado/CI verde; aún no conectado al servicio BFF |
| Productos: disponibilidad | Adaptador offline de PR #358, 10/10 | Aprobado/CI verde; fuente G6 marca la operación provisional; aún no conectado |
| Ofertas | Operación fuente `POST /promociones/evaluar` en OpenAPI H5 | Contrato fijado en matriz; sin recorrido REAL conectado a la compra |
| Ejecución en CI | [Run #45460005926, PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45460005926) y [run #45459779825, PR #358](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45459779825) | Checks pasaron; falta integrar sus PRs al branch de entrega acordado y enlazar la suite final desde develop |

Los artefactos ya cubren el criterio offline positivo/negativo y la versión contractual en sus PRs. Para cerrar #293, integrar el pin #354 y los adaptadores #358 al branch objetivo, ejecutar CI allí y dejar claro que precio/disponibilidad no están conectados en runtime. La suite de Ventas #295 y los snapshots de G5 no sustituyen estos contratos.
