# F-039 — QA seguridad / DevSecOps

Fecha: 05/11/2026. Issue: [#193](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/193). PR: [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). Responsable: Diego Espinoza. Revisión independiente solicitada a Fernando Saire (`saire22`).

## Decisión y contrato evaluados

La decisión vigente del solicitante es agregar una unidad al carrito por cada acción explícita, conservando el favorito y su `createdAt` tanto en éxito como en error. No existe ruta `move-to-cart`, eliminación automática del favorito, retry automático ni selección arbitraria de variantes. La propuesta está en [SPECS PR #15](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/15); su aceptación independiente debe seguir su estado propio.

## Controles y evidencia

| Riesgo/caso | Resultado esperado y evidencia automatizada |
|---|---|
| `redirectUrl` externa o manipulada | `RealWishlistCatalog` acepta sólo slugs en formato `[a-z0-9-]` y genera `/productos/{slug}`. `src/catalog/real-wishlist-catalog.spec.ts` confirma ruta interna para slug válido y rechazo (`503` neutro) de `//evil.test`. |
| Elegir variante/SKU arbitrariamente | No se recibe SKU en esta operación. Producto con variantes produce `422 VARIANT_SELECTION_REQUIRED` y redirección interna derivada del slug validado. `test/wishlist-handoff.integration-spec.ts` lo comprueba. |
| Cambio de titular | El controlador deriva `customerId` de la identidad autenticada. Servicio y transacción bloquean el propietario; el favorito requerido se consulta por `(customerId, productId)`. Se rechaza favorito ausente/ajeno sin crear carrito. |
| Repetición explícita/concurrencia | Dos solicitudes explícitas suman dos unidades; bloqueo compartido con adición ordinaria protege cantidad acumulada. No hay retry automático. |
| Error comercial/stock/proveedor | Producto retirado `404`, stock insuficiente `409`, datos comerciales/catálogo no disponibles `503`; favoritos permanecen y no quedan escrituras parciales. |
| Fallo posterior a escribir carrito | Inyección controlada de error dentro de la transacción devuelve `500 INTERNAL_ERROR`, conserva la fila favorita y revierte la creación del carrito. |
| Éxito | Respuesta `200`; una unidad en carrito; mismo ID y `createdAt` del favorito. Persistencia de ambos estados comprobada tras reiniciar la aplicación. |

La suite usa PostgreSQL 16 temporal y proveedores sandbox/controlados; demuestra transacciones e invariantes locales, no una integración G6 REAL. Fuentes: `src/wishlist/wishlist-cart.service.ts`, `src/wishlist/wishlist.controller.ts`, `src/catalog/real-wishlist-catalog.ts`, `src/catalog/real-wishlist-catalog.spec.ts` y `test/wishlist-handoff.integration-spec.ts`.

## Scans y CI

El workflow de seguridad [auth-session](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/42092126915) y los checks de [PR #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239) pasaron sobre el corte actualizado. La evidencia SAST/SCA/secretos está en [F-037 QA seguridad](F037-QA-SEGURIDAD-2026-11-05.md): Gitleaks fuente/historial/build sin hallazgos, Semgrep sin hallazgos en 191 archivos, 0 vulnerabilidades runtime, 0 altas/críticas; el árbol completo presenta 4 bajas y 17 moderadas de desarrollo. Es un scan compartido del mismo PR/lockfile, no un análisis exclusivo del flujo F-039. Las pruebas dirigidas específicas de F-039 se indican arriba.

El despliegue se omitió por tratarse de un evento `pull_request`. El BFF público tampoco expone un SHA atribuible a este candidato; no se declara DAST autenticado en despliegue.

## Estado y pendientes

La implementación y los negativos locales bajo control de G1 están documentados y listos para revisión. No se identifica programación adicional conocida para esta issue. El cierre funcional aún depende de aceptación del contrato SPECS #15, homologación G6 real de #192, prueba en despliegue identificable por SHA y aprobación independiente. Estas dependencias no se presentan como pruebas realizadas.
