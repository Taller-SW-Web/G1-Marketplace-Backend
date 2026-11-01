# Evidencia local — Checkout F-025 (Backend)

- Base evaluada: `origin/develop` `cd0b93a` (27-oct-2026).
- Alcance de runtime ya presente en la base: preparación idempotente, fingerprint, revalidación y persistencia `CheckoutOperation` en `src/checkout/checkout.service.ts` y esquema Prisma. Esta PR agrega pruebas ejecutables de integración en `test/checkout.integration-spec.ts` para validar esa frontera en PostgreSQL 16.
- Validación local ejecutada: `npm run typecheck` aprobado; `npm run test:unit` 17 suites / 154 pruebas aprobadas; `npm run test:e2e` 13 suites / 179 pruebas aprobadas / 13 omitidas; `prisma validate` aprobado con URL local ficticia (no conecta a DB).
- Casos de integración añadidos (pendientes de ejecución en PostgreSQL): versión 16, PREPARED persistido después de revalidación sin pedido/pago, replay/fingerprint, concurrencia de misma clave, aislamiento de titulares, restricciones de unicidad/huella/contexto/FK y rollback.
- Gate DB pendiente: `TEST_DATABASE_URL`, `DATABASE_URL` y `H3_ALLOW_TEST_DATABASE_WRITES` no estaban configurados; Docker Engine tampoco estaba disponible. `npm run test:integration` se detuvo por su guardia antes de conectar o escribir. La suite no se declara aprobada; falta ejecutarla en la base PostgreSQL 16 desechable `marketplace_h3_test`, migrada previamente.
- Integración REAL/proveedor y revisión independiente: pendientes. No cerrar #126/#127 ni las tareas QA/INT asociadas con esta evidencia local/MOCK.
