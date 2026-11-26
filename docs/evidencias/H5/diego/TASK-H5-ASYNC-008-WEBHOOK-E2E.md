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
