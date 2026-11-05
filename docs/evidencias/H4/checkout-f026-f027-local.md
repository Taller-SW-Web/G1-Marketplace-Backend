# Evidencia local — Checkout F-026–F-027 (Backend)

- Base evaluada: `origin/develop` `cd0b93a` (27-oct-2026).
- Alcance de runtime ya presente en la base: creación idempotente del pedido, recuperación de resultado incierto, consulta propietaria y respuesta autoritativa de Sales. Esta PR añade cobertura opt-in PostgreSQL en `test/checkout-orders.integration-spec.ts` y alinea la consulta de operaciones FAILED con el 409 exigido por F-027.
- Validación local ejecutada: `npm run typecheck` aprobado; `npm run test:unit` 17 suites / 155 pruebas aprobadas; `npm run test:e2e` 13 suites / 179 pruebas aprobadas / 13 omitidas; `prisma validate` aprobado con URL local ficticia (sin conexión a DB).
- Casos de integración añadidos (pendientes de ejecución PostgreSQL): estados SUBMITTED/SUCCEEDED/FAILED, recuperación por la misma clave, consulta de estado autoritativo, ownership, unique de clave, concurrencia y rollback.
- Gate PostgreSQL pendiente: `TEST_DATABASE_URL`, `DATABASE_URL` y `H3_ALLOW_TEST_DATABASE_WRITES` no están configurados; Docker Engine no está disponible. La suite no se declara aprobada; falta ejecutarla en la base PostgreSQL 16 desechable `marketplace_h3_test`, migrada previamente.
- Límite proveedor: Sales usa dobles; esto no acredita Sales REAL, email ni despliegue. Evidencias INT siguen pendientes.
- Revisión independiente: pendiente. No cerrar #131/#132/#136/#137 ni tareas QA/INT asociadas con esta evidencia local.
