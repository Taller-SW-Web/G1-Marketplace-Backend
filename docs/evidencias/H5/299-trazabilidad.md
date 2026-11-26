# #299 — Trazabilidad F → prueba → run

Objetivo: que cada requisito funcional expuesto tenga una prueba identificable y un run reproducible, con `correlation-id` visible en la evidencia.

| F / criterio | Prueba (nombre y ubicación) | Run | Resultado / reporte | `correlation-id` visible | Estado |
|---|---|---|---|---|---|
| F por mapear: checkout / crear pedido `PED-2026-00092` | `POST /api/v1/checkout/orders` | [Informe de compra fusionado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real#compra-real-con-ventas-be-380-397-387); [reporte sanitizado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/evidencias/H5/integracion-real/compra/2026-11-26/REAL-2026-11-26T20-05-16.062Z-6afb7c7c.md) | 26/11 15:06:11, HTTP 202; Ventas confirmó canal MARKETPLACE; `requestId=e1e1933f-0510-4918-af56-34d3a588f064` | **No aportado**; solo hay `requestId` | REAL reportado/publicado; no cierra #299 |
| F por mapear: consulta de pedido | `GET /api/v1/orders/me`, `GET /api/v1/orders/PED-2026-00092` | [Informe de compra fusionado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real#compra-real-con-ventas-be-380-397-387) | 26/11 15:26, ambos HTTP 200; `requestId=d1750523-fd6b-43f6-b8ac-e9e64a55ee9f` y `103f155a-6040-4fa9-89de-f7f39fa7ab1e`; pedido `PAGADO` | **No aportado** | REAL reportado/publicado; falta correlación en logs |
| F por mapear: reintento idempotente | Misma operación y `Idempotency-Key` | [BE #380](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/380) / [#397](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/397); permalink/run: Pendiente | 26/11 15:46:09, HTTP 202; mismo pedido, sin duplicado; Ventas confirmó que la clave mapea solo a `00092`; `requestId=132ea7e8-9bdc-46f6-b8ac-e9e64a55ee9f` | **No aportado** | Parcial; prueba funcional reportada |
| Evento de G7 en `marketplace.usuarios` | Lectura de cola y cotejo con outbox | [BE #313](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/313) y [#294](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/294); permalink exacto: Pendiente | Evento `5206c121-61e7-4de9-8fe9-0b11306c0daa`, leído el 25/11 23:07 | `eventId` visible, pero no se aportó `correlation-id` de log | REAL reportado; falta la traza F→test→run |

## Captura por run

- Funcionalidad / escenario F:
- Caso de prueba y versión:
- Run (URL permanente) y fecha/hora:
- Commit / release y ambiente:
- `correlation-id` exacto y dónde se ve (respuesta, log, evento o traza):
- Resultado observado y enlace al reporte/tabla:
- Incidencias o límites:

> Los identificadores recibidos para la compra son `requestId`; para el mensaje de G7 se recibió un `eventId`. Ninguno de esos valores demuestra por sí mismo que `correlation-id` esté propagado y visible en los logs. Las claves `requestId` exactas están en la tabla anterior y deben cotejarse con los registros fuente; la F asociada también debe mapearse a su ID de SPEC.

La evidencia de cuenta B 403, CSAT y `ENTREGADO` REAL de `PED-2026-00092` continúa pendiente.

## Regla de aceptación documental

No marcar una fila como trazada si falta cualquiera de los enlaces F, prueba o run, o si el identificador no se puede seguir visualmente en la evidencia. Si un sistema no propaga el mismo ID, documentar el mapeo explícito entre IDs y el punto donde ocurre.
