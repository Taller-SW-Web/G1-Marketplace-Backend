# TASK-F014-BE-001 — cuarto estado comercial

[Issue #76](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/76). Base: `feat/h4-f012-f015-detalle-comercial` (`bcc5b60b4ba61a7e5952b236d0237a565723ad5a`).

Se incorpora `UNDETERMINED` al DTO y al fixture de disponibilidad de `producto-demostracion-7`. Es una respuesta comercial válida, distinta de agotado y error técnico. La guardia pública permite sólo sus cuatro campos, sin saldos ni ubicaciones.

`src/catalog/g6-availability.mapper.ts` traduce los cuatro estados de G6. Valida respuesta de un único SKU solicitado y proyecta exclusivamente identidad, estado y fecha. Es una función pura preparada para el futuro adaptador: no hace HTTP ni sustituye la validación previa de pertenencia producto/SKU. `ProductAvailabilityService` conserva su bloqueo REAL 503.

Fuente: [M01 aceptado y comunicado por G6](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/40b566976fb94d924116dcd01d41b3276c2bc9e3/integraciones/ACUERDO_G1_G6_H4_2026-10-20.md). Se adopta su semántica; no se inventa conformidad de G1 o grants externos.

## Validación local

- `npm run build` y `npm run typecheck`: PASS.
- `npm run test:unit`: 203 casos PASS en la rama completa, tras aplicar el parche de dependencias del aporte QA.
- Suite focalizada mapper/seguridad/comercio: 55 casos PASS; cinco son nuevos casos del mapeo y fixture/gate.
- `npm run test:e2e -- test/product-commerce.e2e-spec.ts`: 32 casos PASS con app HTTP local y datos MOCK.

Artefactos: DTO/fixture F-014, mapper y `g6-availability.mapper.spec.ts`. El endpoint MOCK devuelve 200 indeterminado; 503 real sigue siendo indisponibilidad, no un estado de stock.

## Límites y revisión

Este aporte de Giuliano continúa las ramas de Sebastián; no modifica asignación ni revisor de la issue. Se mantiene separado de las entregas F-006–F-010. No se afirma aprobación humana, identidad G7, integración REAL ni despliegue. No se ejecutaron reservas, consumo de cupón ni operaciones contra servicios remotos.

La issue conserva su DoD y permanece abierta. Faltan revisión independiente del nuevo corte, integración autorizada y comprobación del SHA desplegado. IA: Codex para implementación, pruebas y registro; revisión humana pendiente.
