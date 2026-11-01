# Evidencia local — Checkout F-025 (Backend)

- Base evaluada: `origin/develop` `cd0b93a` (27-oct-2026).
- Alcance de runtime ya presente en la base: preparación idempotente, fingerprint, revalidación y persistencia `CheckoutOperation` en `src/checkout/checkout.service.ts` y esquema Prisma. Esta PR agrega pruebas ejecutables de integración en `test/checkout.integration-spec.ts` para validar esa frontera en PostgreSQL 16.
- Validación local: `npm run typecheck` aprobado; `npm run test:unit` 17 suites / 154 pruebas; `npm run test:e2e` 13 suites / 179 aprobadas / 13 omitidas. `prisma validate` aprobado. Tras el ajuste de aserciones y fixture, `npm run test:integration` aprobó 3 suites / 28 pruebas.
- Entorno DB: Docker `postgres:16`, servidor 16.15, contenedor desechable sin volumen, enlazado a `127.0.0.1:55432`; DB `marketplace_h3_test`, esquema `public`; las 4 migraciones existentes se aplicaron con `npm run prisma:deploy` antes de ejecutar la suite. El runner recibió `TEST_DATABASE_URL` local y `H3_ALLOW_TEST_DATABASE_WRITES=true`; no se usó producción.
- Alcance/limitaciones: checkout PREPARED, replay/fingerprint, titularidad, constraints, FK y rollback de una transacción Prisma con excepción. La concurrencia es de una instancia del servicio; el rollback no inyecta un fallo dentro del flujo de negocio. No afirmar atomicidad de negocio o concurrencia multiproceso a partir de estos casos.
- Proveedor MOCK; no acredita integración REAL ni despliegue. Revisión independiente pendiente. No cerrar #126/#127 ni tareas QA/INT asociadas sólo con esta evidencia.
