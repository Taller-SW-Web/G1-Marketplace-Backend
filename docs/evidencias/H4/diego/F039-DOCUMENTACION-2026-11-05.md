# F-039 — Agregar al carrito conservando el favorito

Fecha: 05/11/2026. Issue documental: [#194](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/194). Implementación: [Backend PR #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). QA seguridad: [issue #193](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/193) y [reporte QA](F039-QA-SEGURIDAD-2026-11-05.md). Responsable: Diego Espinoza. Revisión independiente: Fernando Saire (`saire22`), pendiente.

## Decisión vigente y estado del contrato

La decisión del usuario para este corte es **agregar una unidad por acción explícita al carrito y conservar el favorito y su `createdAt`, tanto si la operación termina correctamente como si falla**. No hay eliminación/movimiento automático, retry automático, selección de SKU/variante arbitraria ni ruta `move-to-cart`.

El endpoint implementado es `POST /api/v1/wishlist/items/{productId}/add-to-cart`; no acepta body, query ni `Idempotency-Key`. El contrato está propuesto en [SPECS PR #15](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/15). Su estado independiente debe verificarse allí; la decisión conversacional no equivale a aprobación formal del PR.

## Trazabilidad SPECS → implementación → pruebas

| Capa | Referencia y correspondencia |
|---|---|
| Requisito funcional/API | [F-039 funcional](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/funcional/F-039-mover-favorito-carrito.md), [contrato API](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/contrato-api/F-039-mover-favorito-carrito.md), [SPECS PR #15](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/15). El nombre histórico “mover” no describe la decisión vigente de conservar. |
| UI/flujo | [V-009 Favoritos](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/ui/vistas/V-009-favoritos.md), [handoff de Favoritos](../../../FAVORITOS-FRONTEND-HANDOFF.md). La UI debe conservar la tarjeta/estado favorito tras agregar y navegar al carrito sólo por acción explícita. |
| HTTP | [`WishlistController.addToCart`](../../../../src/wishlist/wishlist.controller.ts): valida ausencia de body, query y clave idempotente; deriva titular de G7 y devuelve `200`. |
| Orquestación/transacción | [`WishlistCartService`](../../../../src/wishlist/wishlist-cart.service.ts): comprueba el favorito y completa resolución SKU/cotización antes de abrir la transacción. Dentro de PostgreSQL bloquea al titular, confirma nuevamente el favorito y añade una unidad. No borra ni actualiza `WishlistItem`. |
| Carrito | [`CartService`](../../../../src/cart/cart.service.ts): obtiene la cantidad candidata antes de cotizar y, bajo bloqueo, confirma que el total no cambió. Una carrera devuelve `409 CART_CHANGED_RETRY` y revierte la transacción en vez de aplicar una cotización obsoleta. |
| Catálogo G6 | [`RealWishlistCatalog`](../../../../src/catalog/real-wishlist-catalog.ts): producto simple resuelve SKU; producto con variantes exige selección y produce `422` con ruta interna basada en slug validado. Precio/stock/proveedor se validan antes de confirmar la escritura. |
| Pruebas | [`wishlist-handoff.integration-spec.ts`](../../../../test/wishlist-handoff.integration-spec.ts), [`real-wishlist-catalog.spec.ts`](../../../../src/catalog/real-wishlist-catalog.spec.ts) y [`F039 QA seguridad`](F039-QA-SEGURIDAD-2026-11-05.md). |

## Comportamiento y errores documentados

| Caso | Resultado observado en pruebas controladas |
|---|---|
| Éxito | `200`, suma una unidad y conserva ID/fecha del favorito; persistencia verificada tras reiniciar la app. |
| Dos acciones explícitas | Suma dos unidades sin duplicar/eliminar el favorito. |
| Favorito ausente o de otro titular | `409 CART_CONFLICT`; no crea carrito. |
| Producto retirado | `404 PRODUCT_NOT_AVAILABLE`; no hay escritura parcial. |
| Producto con variantes | `422 VARIANT_SELECTION_REQUIRED`; no se selecciona SKU automáticamente; `redirectUrl` es ruta interna. |
| Stock insuficiente | `409 STOCK_LIMIT_REACHED`; conserva el carrito previo y el favorito. |
| Catálogo/condición comercial no disponible | `503` neutro; conserva el favorito y no deja carrito parcial. |
| Error inyectado tras escribir carrito dentro de la transacción | `500 INTERNAL_ERROR`; PostgreSQL revierte la escritura del carrito y mantiene favorito/fecha. |
| Catálogo lento / carrera mientras se cotiza | Las llamadas externas terminan antes de iniciar la transacción. Si otra solicitud cambia la cantidad antes del lock, responde `409 CART_CHANGED_RETRY` sin escritura parcial. |
| Body, query o clave no admitidos / no autenticado | `400` / `401`; operación no realizada. |

Las pruebas usan PostgreSQL temporal y proveedores controlados. Son evidencia de contrato e invariantes locales, no de homologación G6 real. Los detalles, comandos, scans compartidos y limitaciones de seguridad están separados en el [reporte QA #193](F039-QA-SEGURIDAD-2026-11-05.md).

## Operación, configuración y límites

La integración real de Catálogo se mantiene detrás de aprobación explícita. El adaptador fija OpenAPI G6 `0.6.0-rc.3` y SHA `a7778ec1a22811c1213a94ef096ab905911342cc`. Catálogo público omite `Authorization`; Pricing e Inventory obtienen JWT técnico G7 para `modulo-marketplace` con `precios:leer` e `inventario:disponibilidad:leer`. G1 no transmite identidad humana a G6. Para `ENVIO_DOMICILIO` el contrato no exige `fulfillment_ref`, por lo que G1 envía sólo el modo y no inventa almacenes o ubicaciones. Sin grants/credenciales efectivos, se falla de forma cerrada; no se usa fixture como fallback en producción.

La respuesta `422` no autoriza una navegación externa: el slug se valida y la ruta se forma en el servidor. No hay reserva de stock, promesa de inventario ni selección de variante. Una llamada repetida sólo agrega otra unidad si fue otra acción explícita del usuario. Ante una carrera, el servidor puede recotizar una vez antes de escribir; no repite la petición HTTP del usuario ni reintenta una escritura de resultado incierto.

## Resolución de observación de revisión — 05/11/2026

La revisión detectó que `resolveSku` y `quote` podían consumir hasta 5 s cada una mientras la transacción mantenía el advisory lock del titular, cuyo timeout total era también 5 s. El flujo fue separado en dos fases:

1. fuera de la transacción: confirmar existencia inicial del favorito, resolver SKU, leer cantidad candidata y cotizar;
2. dentro de la transacción: adquirir lock, confirmar que el favorito sigue existiendo y comparar el total actual con el total cotizado antes de escribir; si cambió, revertir y recotizar una sola vez fuera de PostgreSQL.

La regresión `wishlist-cart.service.spec.ts` usa dos demoras controladas de catálogo y comprueba que `$transaction` todavía no comenzó durante ninguna; otro caso verifica la recotización acotada ante una carrera. Las pruebas unitarias dirigidas quedaron en **37/37 PASS**, las HTTP de wishlist en **31/31 PASS** y typecheck en **PASS**. La corrida PostgreSQL aislada no pudo repetirse localmente porque Docker Desktop no estaba iniciado; el workflow `verify` del PR conserva esa verificación en CI.

## Estado documental y siguiente paso

Esta documentación cubre lo que G1 puede preparar antes de solicitar/homologar la integración. Por instrucción del usuario, el seguimiento de la issue #194 queda **bloqueado** hasta que se solicite la integración real; no se deben adelantar validaciones dependientes ni marcarla como terminada. Cuando se solicite, hacen falta contrato/provider y grant autorizados, datos de producto/stock/precio, traza sanitizada positivo/error/timeout, verificación de despliegue por SHA y revisión independiente.
