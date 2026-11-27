# #299 — Trazabilidad F → prueba → run

Objetivo: que cada requisito funcional expuesto tenga una prueba identificable y un run reproducible, con `correlation-id` visible en la evidencia.

| F / criterio | Prueba (nombre y ubicación) | Run | Resultado / reporte | `correlation-id` visible | Estado |
|---|---|---|---|---|---|
| F por mapear: checkout / crear pedido `PED-2026-00092` | `POST /api/v1/checkout/orders` | [Informe de compra fusionado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real#compra-real-con-ventas-be-380-397-387); [reporte sanitizado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/evidencias/H5/integracion-real/compra/2026-11-26/REAL-2026-11-26T20-05-16.062Z-6afb7c7c.md) | 26/11 15:06:11, HTTP 202; Ventas confirmó canal MARKETPLACE; `requestId=e1e1933f-0510-4918-af56-34d3a588f064` | **No aportado**; solo hay `requestId` | REAL reportado/publicado; no cierra #299 |
| F por mapear: consulta de pedido | `GET /api/v1/orders/me`, `GET /api/v1/orders/PED-2026-00092` | [Informe de compra fusionado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real#compra-real-con-ventas-be-380-397-387) | 26/11 15:26, ambos HTTP 200; `requestId=d1750523-fd6b-43f6-b8ac-e9e64a55ee9f` y `103f155a-6040-4fa9-89de-f7f39fa7ab1e`; pedido `PAGADO` | **No aportado** | REAL reportado/publicado; falta correlación en logs |
| F por mapear: reintento idempotente | Misma operación y `Idempotency-Key` | [BE #380](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/380) / [#397](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/397); permalink/run: Pendiente | 26/11 15:46:09, HTTP 202; mismo pedido, sin duplicado; Ventas confirmó que la clave mapea solo a `00092`; `requestId=132ea7e8-9bdc-46f6-b8ac-e9e64a55ee9f` | **No aportado** | Parcial; prueba funcional reportada |
| Evento de G7 en `marketplace.usuarios` | Lectura de cola y cotejo con outbox | [BE #313](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/313) y [#294](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/294); permalink exacto: Pendiente | Evento `5206c121-61e7-4de9-8fe9-0b11306c0daa`, leído el 25/11 23:07 | `eventId` visible, pero no se aportó `correlation-id` de log | REAL reportado; falta la traza F→test→run |
| G7 — recuperación del evento REAL desde DLQ | Consumidor RabbitMQ; recuperación manual con parser candidato `20cdb57` (#409) | [BE #314, comentario de recuperación](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314#issuecomment-7205557701) / [BE #315](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/315) | 26/11 18:26:36 Lima; tres mensajes originales recuperados con una fila por ID; cuatro filas/cuatro IDs únicos contando la recepción previa | `correlation-id` no aportado en los logs públicos | REAL controlado; recuperación manual desde DLQ, no prueba reintento automático ni nueva publicación post-fix |
| F-001..F-040 / logging HTTP | [Matriz y traza por F en PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/aeac35ff99d8bf5a685c6ce43cb5fd2fec8add5e/docs/evidencias/H5/MATRICES-TASK-H5-291-299.md); [middleware y pruebas](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/354/files) | Run de PR #354: [Build, Compile y Test](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45460005926); matriz y middleware aún esperan merge | Mapeo F→prueba publicado en PR #354; access log registra la ruta y `requestId` sin URL/query/PII | Visible como `requestId` en el log HTTP; comprobar si el criterio exige además un campo literal `correlationId` en cada flujo | Avance de código y matriz; no es una traza REAL conjunta |
| Consumidor Rabbit G7 — correlación, retries y recuperación | [PR #390, issue #317](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/390); commit `81a3364`; tests de `security-user-event-consumer.service` y recuperación | [CI backend PR #390](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45891697593); PR sigue abierta y requiere revisión | El cambio agrega logs estructurados con `correlationId` sanitizado y métricas; sus pruebas declaradas son locales/sintéticas | Log de la prueba usa metadata controlada; falta un `correlationId` no nulo visible en el registro REAL de #313/#314 | Avance de código, no traza REAL; no cerrar #299 solo con el test local |

## Captura por run

- Funcionalidad / escenario F:
- Caso de prueba y versión:
- Run (URL permanente) y fecha/hora:
- Commit / release y ambiente:
- `correlation-id` exacto y dónde se ve (respuesta, log, evento o traza):
- Resultado observado y enlace al reporte/tabla:
- Incidencias o límites:

> Los identificadores recibidos para la compra son `requestId`; para el mensaje G7 se registró `eventoId/eventId`. PR #354 agrega logs HTTP con `requestId`; PR #390 instrumenta `correlationId` en el consumidor Rabbit. No renombrar un ID como otro ni usar un valor de fixture como evidencia REAL.

La [PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/354) ya trae la matriz F-001..F-040, los comandos y el middleware de access-log; está aprobada y con CI exitoso, pero aún no fusionada. Su etiqueta `LOCAL`/`PIN`/`BLOCKED` describe el límite de ejecución y no debe reinterpretarse como integración REAL. Después del merge, completar la relación visual por run y agregar el `correlationId` real del productor cuando esté disponible. Cuenta B 403, CSAT y `DESPACHADO`/`ENTREGADO` REAL de `PED-2026-00092` siguen pendientes.

## Regla de aceptación documental

No marcar una fila como trazada si falta cualquiera de los enlaces F, prueba o run, o si el identificador no se puede seguir visualmente en la evidencia. Si un sistema no propaga el mismo ID, documentar el mapeo explícito entre IDs y el punto donde ocurre.
