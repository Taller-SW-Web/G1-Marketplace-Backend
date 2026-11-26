# TASK-H5-ASYNC-008 (`BE #320`): Pruebas E2E de duplicado, reintento y fallo del webhook con `correlation-id`

- **Issue:** [BE #320](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/320)
- **Responsable:** `@DiesmEsp` · **Revisor:** `@saire22`
- **Endpoint cubierto:** `POST /api/v1/webhooks/ventas/envios` (`ShipmentWebhookController` / `ShipmentWebhookService`)

## 1. Cambios y trazabilidad `Despacho → Ventas → Marketplace`

- En [shipment-webhook.service.ts](../../../src/webhooks/ventas/shipment-webhook.service.ts):
  - `sanitizeCorrelationId` extrae `X-Correlation-Id` / `X-Request-Id` (con fallback a `randomUUID()`), validado a `[A-Za-z0-9._:-]{1,64}`.
  - Emite logs JSON sanitizados sin secretos ni PII:
    - `shipment_webhook_processed` (`correlationId`, `eventId`, `orderId`, `outcome`: `accepted` | `duplicate`)
    - `shipment_webhook_rejected` (`correlationId`, `code`: `WEBHOOK_UNAUTHORIZED` | `INVALID_SHIPMENT_EVENT`)

## 2. Suite E2E (`test/shipment-webhook-correlation.e2e-spec.ts`)

| Caso | Escenario | `eventId` / `X-Correlation-Id` | Resultado observado |
|---|---|---|---|
| 1 | Entrega inicial + duplicado | Mismo `eventId` y `corrId` (`despacho-ventas-mk-001`) | `200 { accepted: true, duplicate: false }` → `200 { accepted: true, duplicate: true }`, 1 registro en inbox y traza completa |
| 2 | Fallo transitorio `500` + reintento | Mismo `eventId` y `corrId` (`despacho-ventas-mk-retry-002`) | Primer intento `500` sin registro parcial → reintento `200 { accepted: true, duplicate: false }` |
| 3 | Fallos `401` y `400` | `despacho-ventas-mk-fail-003` | `401 WEBHOOK_UNAUTHORIZED` (sin filtrar token) y `400 INVALID_SHIPMENT_EVENT` con `X-Request-Id` preservado |

## 3. Verificación en producción Render (`shipment_event_inbox` — 2026-11-26)

Consulta sobre PostgreSQL de producción (`marketplace-db`) tras la activación del webhook de Ventas con reintento automático después de cold-start:
- **7 eventos** persistidos hoy entre `11:05:47.943` y `11:05:50.309` (hora Lima) para pedidos `PED-2026-90001`, `PED-2026-90003`, `PED-2026-90005` y `PED-2026-90006` sin duplicados.

## 4. Comandos ejecutados
- `npm run lint` (`tsc --noEmit`): **PASS** (`0` errores)
- `npx jest --config ./test/jest-e2e.json --runInBand test/shipment-webhook-correlation.e2e-spec.ts`: **PASS** (`1/1` suite, `3/3` tests)
- `npm run test:unit`: **PASS** (`61/61` suites, `715/715` tests)
