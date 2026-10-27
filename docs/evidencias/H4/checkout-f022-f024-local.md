# Evidencia local — Checkout F-022–F-024 (Backend)

- Base evaluada: `origin/develop` `cd0b93a` (27-oct-2026); implementación de esta PR: `5bb21af`.
- Alcance: ownership de direcciones desde el principal/token; cotización ligada al addressId/cartVersion/líneas autoritativas; cache de quotes aislado por titular; beneficio validado contra el contexto de la quote actual.
- Fallo seguro: respuestas incoherentes de cotización/beneficios se rechazan sin reemplazar la quote vigente; 422 y timeout de Benefits conservan la quote; respuesta tardía no pisa una nueva quote aunque reutilice el mismo ID.
- DTO/API: las pruebas HTTP verifican Bearer y subject autenticado, rechazan `userId` y totales del cliente, y cubren rutas de dirección, cotización y beneficios.
- Comandos: `npm run typecheck`; `npm run test:unit`; `npm run test:e2e`.
- Resultado: typecheck aprobado; 17 suites unitarias / 166 tests aprobados; E2E 13 suites aprobadas / 183 tests aprobados / 13 omitidos.
- Casos relacionados: `src/checkout/checkout.service.spec.ts`, `src/checkout/quotes.service.spec.ts`, `src/checkout/external/mock-http.adapter.spec.ts` y `test/checkout.e2e-spec.ts`.
- Límites: validación local con fixtures/dobles; no acredita G-ADDRESS REAL (#115), I-01/I-06 (#119), G-BENEFIT (#123) ni despliegue. No se añadió persistencia local de direcciones ni migración DB. La advertencia de readiness por DB no disponible procede de la prueba de Health.
- Revisión independiente: pendiente (Diego Espinoza). No cerrar #114/#118/#122 ni las tareas QA/INT asociadas hasta completar sus gates.
