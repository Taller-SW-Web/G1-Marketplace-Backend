# TASK-H5-ASYNC-008 (`BE #320`): Pruebas E2E de duplicado, reintento y fallo del webhook con `correlation-id`

- **Issue:** [BE #320](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/320)
- **Responsable:** `@DiesmEsp` · **Revisor:** `@saire22`
- **Endpoint cubierto:** `POST /api/v1/webhooks/ventas/envios` (`ShipmentWebhookController` / `ShipmentWebhookService`)

## 1. Cambios y trazabilidad `Despacho → Ventas → Marketplace`

- En [shipment-webhook.service.ts](../../../../src/webhooks/ventas/shipment-webhook.service.ts) se generan estos registros.
  - `sanitizeCorrelationId` extrae `X-Correlation-Id` / `X-Request-Id` (con fallback a `randomUUID()`), validado a `[A-Za-z0-9._:-]{1,64}`.
  - Emite logs JSON sanitizados sin secretos ni PII:
    - `shipment_webhook_processed` (`correlationId`, `eventId`, `orderId`, `outcome`: `accepted` | `duplicate`)
    - `shipment_webhook_rejected` (`correlationId`, `code`: `WEBHOOK_UNAUTHORIZED` | `INVALID_SHIPMENT_EVENT`)
    - `shipment_webhook_persistence_failed` (`correlationId`, `eventId`, `code`: `SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE`)

## 2. Casos E2E del receptor

| Caso | Escenario | `eventId` / `X-Correlation-Id` | Resultado observado |
|---|---|---|---|
| 1 | Entrega inicial + duplicado | Mismo `eventId` y `corrId` (`despacho-ventas-mk-001`) | `200 { accepted: true, duplicate: false }` → `200 { accepted: true, duplicate: true }`, un registro en el inbox en memoria y logs de ambos intentos en Marketplace |
| 2 | Fallo de persistencia `503` + reintento en PostgreSQL 16 desechable | Mismo `eventId` y `corrId` (`despacho-ventas-mk-retry-002`) | Primer `INSERT` simulado como fallido, `503 SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE` y cero filas. El reintento ejecuta el `INSERT` real, responde `200 { accepted: true, duplicate: false }` y deja una fila. Ambos logs comparten los identificadores. |
| 3 | Fallos `401` y `400` | `despacho-ventas-mk-fail-003` | `401 WEBHOOK_UNAUTHORIZED` (sin filtrar token) y `400 INVALID_SHIPMENT_EVENT` con `X-Request-Id` preservado |

## 3. Verificación en producción Render (`shipment_event_inbox` — 2026-11-26)

La consulta al inbox de Marketplace en Render verificó la recepción y persistencia de **7 eventos** sin duplicados entre las `11:05:47.943` y las `11:05:50.309` (hora de Lima).

Para cerrar #320, queda coordinar con Leo y Ventas el cotejo de una traza sanitizada del mismo evento en Despacho, Ventas y Marketplace. Debe incluir `eventId`, `correlationId`, el fallo y su reintento, con las marcas de tiempo y los resultados de cada módulo. La prueba E2E de PostgreSQL verifica el fallo y el reintento dentro del receptor de Marketplace.

## 4. Comandos ejecutados
- `npm run lint` (`tsc --noEmit`): **PASS** (`0` errores)
- El caso de reintento por `503` corre con `npm run test:ventas:webhook:postgres` en el job `H-05 inbox integration (PostgreSQL 16 disposable)` de GitHub Actions. Los casos de duplicado y rechazo están en `test/shipment-webhook-correlation.e2e-spec.ts`.
- `npm run test:unit`: **PASS** (`61/61` suites, `715/715` tests)

## 5. Ensayo coordinado de reintento en el servicio actual de G1

El receptor conserva la URL que usa Ventas. La migración aditiva `20261127000100_shipment_webhook_qa_failure` crea una tabla separada del inbox y C-002. La prueba de regresión del flujo apagado corre dentro del job `integration-postgres-ci` de BE #383 con PostgreSQL 16 desechable y comprueba siete recepciones, `duplicate: true` y la cola C-002.

- `VENTAS_WEBHOOK_QA_503_ENABLED=true` habilita el mecanismo. Si la variable falta o está apagada, el receptor no accede a la tabla de control.
- `VENTAS_WEBHOOK_QA_503_ORDER_ID` debe ser un pedido sintético acordado del espacio `PED-2099-xxxxx`, distinto del configurado para C-002. Cada pedido sintético tiene un único uso persistente.
- `VENTAS_WEBHOOK_QA_503_EXPIRES_AT` fija el vencimiento en ISO 8601 UTC, con sufijo `Z`.

Para un evento válido y autenticado, el primer intento elegible guarda `eventId` y `correlationId` en la tabla de control, registra `shipment_webhook_qa_503` y devuelve `503` antes de insertar en el inbox. El reintento usa el flujo normal. Antes de la ventana, verificar que la migración esté aplicada, confirmar con Ventas que reintenta ante `503`, aplicar solo las tres variables en una actualización y verificar `/health` tras el despliegue. Después de la ventana, retirar las tres variables y volver a verificar `/health`. Si Ventas no reintenta ante `503`, usar el E2E de #399 y la evidencia del duplicado real.
