# Evidencia local — Checkout F-026–F-027 (Backend)

- Base evaluada: `origin/develop` `cd0b93a` (27-oct-2026).
- Alcance de runtime ya presente en la base: creación idempotente del pedido, recuperación de resultado incierto, consulta propietaria y respuesta autoritativa de Sales. Esta PR añade cobertura opt-in PostgreSQL en `test/checkout-orders.integration-spec.ts` y alinea la consulta de operaciones FAILED con el 409 exigido por F-027.
- Validación local: `npm run typecheck` aprobado; `npm run test:unit` 17 suites / 155 pruebas; `npm run test:e2e` 13 suites / 179 aprobadas / 13 omitidas. Tras validar el entorno, `npm run test:integration` aprobó 3 suites / 30 pruebas.
- Entorno DB: Docker `postgres:16`, servidor 16.15, contenedor desechable sin volumen, enlazado a `127.0.0.1:55432`; DB `marketplace_h3_test`, esquema `public`; se aplicaron las 4 migraciones existentes con `npm run prisma:deploy`. El runner recibió `TEST_DATABASE_URL` local y `H3_ALLOW_TEST_DATABASE_WRITES=true`; no se usó producción.
- Casos: persistencia SUBMITTED/SUCCEEDED/FAILED, recuperación por clave, consulta autoritativa, ownership, colisión de clave, concurrencia de solicitudes en una instancia y rollback de transacción Prisma con excepción. La concurrencia usa Sales MOCK y no demuestra deduplicación de pedidos externos; el rollback no inyecta un fallo dentro de `createOrder`.
- Límite proveedor: Sales permanece MOCK; no se acredita Sales REAL, email ni despliegue. Evidencias INT siguen pendientes.
- Revisión independiente pendiente. No cerrar #131/#132/#136/#137 ni tareas QA/INT asociadas sólo con estas pruebas locales.
