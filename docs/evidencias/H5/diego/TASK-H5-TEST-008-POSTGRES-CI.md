# Evidencia `BE #297` (`TASK-H5-TEST-008`) — Integración en CI con PostgreSQL desechable y dobles HTTP deterministas

- **Issue:** `Taller-SW-Web/G1-Marketplace-Backend#297`
- **Responsable:** Diego Espinoza (`@DiesmEsp`)
- **Revisor:** Fernando Saire (`@saire22`)
- **Fecha:** 2026-11-26
- **Base:** `develop` (`ea29475`)

## 1. Job de CI con PostgreSQL 16 desechable y migración desde cero

Se incorporó el job `integration-postgres-ci` (`Disposable PostgreSQL 16 integration (migrate + doubles)`) en `.github/workflows/backend-ci.yml`, ejecutándose junto al job existente `shipment-webhook-postgres`:

1. Levanta servicio `postgres:16` desechable (`POSTGRES_DB: marketplace_h3_test`) con healthcheck `pg_isready`.
2. Ejecuta `npm run prisma:generate`.
3. Aplica migraciones desde cero con `npm run prisma:deploy` y verifica idempotencia ejecutando un segundo `npm run prisma:deploy`.
4. Ejecuta `npm run test:integration:ci` con seis suites de integración en PostgreSQL 16.
   - `test/checkout.integration-spec.ts`
   - `test/checkout-orders.integration-spec.ts` (reincorporada tras la corrección de los cuatro casos en [BE #402](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/402)).
   - `test/csat.integration-spec.ts`
   - `test/wishlist.integration-spec.ts`
   - `test/wishlist-handoff.integration-spec.ts`
   - `test/http-doubles-postgres.integration-spec.ts`

## 2. Dobles HTTP deterministas (`test/http-doubles-postgres.integration-spec.ts`)

Se implementó una suite contra servidor HTTP local real (`node:http` en `127.0.0.1:0`) y `SalesCsatGateway` + `CsatService` + `PrismaService` conectados a PostgreSQL 16 desechable, validando:

| Caso determinista | Comportamiento del doble HTTP | Resultado esperado y persistencia verificada |
|---|---|---|
| **Timeout** | Retardo de `600ms` con `HTTP_TIMEOUT_MS=200` | Aborta con `503 SALES_UNAVAILABLE`; fila en `post_delivery_prompts` permanece `SHOWN` (`submittedAt: null`) |
| **5xx** | Respuesta `503` en pedido y `502` en envío | Mapeo a `503 SALES_UNAVAILABLE`; sin mutación en PostgreSQL |
| **Duplicado** | Respuesta `409 CSAT_ALREADY_SUBMITTED` | Reconcilia el estado local a `SUBMITTED` y rechaza reintentos posteriores sin repetir llamada |
| **Éxito** | Respuesta `200 ENTREGADO` + `201` | Persiste `SUBMITTED` con `submittedAt` en PostgreSQL |

## 3. Verificación local y en CI

- Local (sin Docker Desktop activo en Windows): `npm run prisma:validate`, `npm run lint` (`tsc --noEmit`) y `npm run test:unit` verificados antes del push; la ejecución completa sobre `postgres:16` corre automáticamente en GitHub Actions (`Backend PR validation`) en el PR asociado.
