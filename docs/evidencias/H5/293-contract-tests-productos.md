# #293 — Contract tests de Productos y Ofertas

**Estado: parcial; no cerrar aún.** Ya hay pruebas de contrato y de adaptación de catálogo en el backend. La suite existente valida el contrato público del BFF y ejercita el adaptador de Productos contra un servidor HTTP local. No demuestra conformidad end-to-end contra los OpenAPI vigentes de Productos y Ofertas ni prueba sus despliegues reales.

## Evidencia existente

| Alcance | Prueba / contrato | Qué acredita | Límite |
|---|---|---|---|
| Contrato público del BFF (F-011–F-015) | [`test/openapi-contract.e2e-spec.ts`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/test/openapi-contract.e2e-spec.ts); comando `npm run test:contract`; [`product-detail-h4.openapi.yaml`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/contratos/product-detail-h4.openapi.yaml) | Valida ejemplos de los contratos versionados y respuestas BFF 200/400/404/409 mediante JSON Schema; el BFF se inicia en `BFF_MODE=mock` | Es contrato de salida del Marketplace, no el OpenAPI proveedor de Productos/Ofertas |
| Adaptador G6 Productos | [`test/catalog-g6-contract.e2e-spec.ts`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/test/catalog-g6-contract.e2e-spec.ts); comando `npm run test:g6:contract` | Ejercita categorías y catálogo a través del adaptador HTTP; incluye mapeo, correlación, errores 401/403/429/503, timeout, redirección, entrada inválida y lista vacía | Servidor HTTP local, token sintético y respuestas controladas; no llama al G6 real. Pin observado: OpenAPI `0.6.0-rc.1`, revisión Docs `c36bd9a`, blob `f64bfe9a` |
| OpenAPI fijados de G5 | [`test/g5-pinned-openapi.spec.ts`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/test/g5-pinned-openapi.spec.ts), snapshots y [`manifest.json`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/contratos/fixtures/g5-pinned/manifest.json) | Verifica procedencia, versiones, hashes y superficie offline de Ventas M1 `1.10.0` y Postventa M2 `1.6.0` | Son Ventas/Postventa; no son el OpenAPI de Ofertas |

## Brechas contra #293

| Operación requerida | Evidencia de contrato proveedor | Estado |
|---|---|---|
| Productos: catálogo/listado y detalle | Adaptador local probado; pin `0.6.0-rc.1` citado por la suite | Parcial: enlazar el snapshot fuente y validar respuestas frente al esquema proveedor vigente |
| Productos: precio | No aparece una prueba de proveedor OpenAPI en `catalog-g6-contract.e2e-spec.ts` | Pendiente |
| Productos: disponibilidad | No aparece una prueba de proveedor OpenAPI en `catalog-g6-contract.e2e-spec.ts` | Pendiente |
| Ofertas | No se encontró un OpenAPI proveedor de Ofertas entre los contratos/snapshots citados arriba | Bloqueado por contrato fuente y versión que debe proporcionar el equipo dueño |
| Ejecución en CI | El workflow backend incluye validación de pruebas; enlazar un run verde que identifique estas suites tras verificar su ejecución | Pendiente de permalink por suite y SHA |

Para cerrar el issue falta fijar los OpenAPI vigentes de Productos **y** Ofertas con URL/commit/versión/hash, completar pruebas positivas y negativas por operación (incluidas precio y disponibilidad), publicar el run de CI correspondiente y registrar cualquier endpoint no disponible como `BLOCKED`. La suite de Ventas #295 y los snapshots de G5 no sustituyen estos contratos.
