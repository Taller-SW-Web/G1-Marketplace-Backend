# Evidencia local — Checkout F-025 (Backend)

- Base evaluada: `origin/develop` `cd0b93a` (27-oct-2026).
- Alcance de código presente: preparación idempotente, fingerprint, revalidación y persistencia `CheckoutOperation` en `src/checkout/checkout.service.ts` y esquema Prisma.
- Comandos: `npm run typecheck`; `npm run test:unit`; `npm run test:e2e`.
- Resultado: typecheck aprobado; 17 suites unitarias / 154 tests aprobados; E2E 13 suites aprobadas, 179 tests aprobados y 13 omitidos.
- Casos relacionados: consentimiento, clave/fingerprint, quote vencida, cambio de carrito/stock, ownership y estados PREPARING/PREPARED/FAILED (ver `src/checkout/checkout.service.spec.ts`, `test/checkout.e2e-spec.ts`).
- Límite DB: estas suites no demuestran constraints/concurrencia/rollback en PostgreSQL 16 temporal. No ejecutar migraciones contra datos persistentes como sustituto; queda pendiente una corrida aislada reproducible para #127.
- Integración REAL/proveedor y revisión independiente: pendientes. No cerrar #126/#127 ni las tareas QA/INT asociadas con esta evidencia MOCK.
