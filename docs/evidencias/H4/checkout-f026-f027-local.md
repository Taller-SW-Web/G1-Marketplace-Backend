# Evidencia local — Checkout F-026–F-027 (Backend)

- Base evaluada: `origin/develop` `cd0b93a` (27-oct-2026).
- Alcance de código presente: creación idempotente del pedido, recuperación de resultado incierto, consulta de operación propietaria y respuesta autoritativa de Sales en `src/checkout/checkout.service.ts`.
- Comandos: `npm run typecheck`; `npm run test:unit`; `npm run test:e2e`.
- Resultado: typecheck aprobado; 17 suites unitarias / 154 tests aprobados; E2E 13 suites aprobadas, 179 tests aprobados y 13 omitidos.
- Casos relacionados: contactos transitorios, Idempotency-Key, timeout/202, aislamiento por customerId, estado SUCCEEDED/PAGADO únicamente con respuesta autoritativa (ver `src/checkout/checkout.service.spec.ts`, `test/checkout.e2e-spec.ts`).
- Límite DB/proveedor: pruebas con dobles; no acreditan transacción PostgreSQL 16, Sales REAL, email ni despliegue. Constraints/rollback de #132/#137 y evidencias INT siguen pendientes.
- Revisión independiente: pendiente. No cerrar #131/#132/#136/#137 ni tareas QA/INT asociadas con esta evidencia local.
