# F-038 Quitar favorito — trazabilidad documental

Fecha de actualización: 05/11/2026. Responsable: Diego Espinoza. Revisor pendiente: Fernando Saire (`saire22`). Issue documental: [#189](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/189).

## Estado del corte

La implementación, contrato y pruebas propias de F-038 están preparados para revisión en [Backend PR #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). El corte consolidado anterior a este incremento es `9fb17df92c148d3251924abebe7ab922d51e79db`; el SHA de esta actualización se registra en la issue y el PR después de publicarlo.

Este documento no acredita integración ni despliegue final: #187 continúa bloqueada, las QA #188 y Frontend #92 esperan aprobación, Render no expone un SHA atribuible al PR y no existe todavía revisión independiente.

## Fuentes vigentes

| Capa | Referencia |
|---|---|
| Funcional | [F-038 Quitar favorito](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/funcional/F-038-quitar-favorito.md) |
| Contrato API | [DELETE `/api/v1/wishlist/items/{productId}`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/contrato-api/F-038-quitar-favorito.md) |
| UI | [F-038 Quitar favorito](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/ui/F-038-quitar-favorito.md) |
| Implementación backend | [`wishlist.controller.ts`](../../../../src/wishlist/wishlist.controller.ts), [`wishlist.service.ts`](../../../../src/wishlist/wishlist.service.ts) y [`wishlist.repository.ts`](../../../../src/wishlist/wishlist.repository.ts) |
| Pruebas | [`wishlist.e2e-spec.ts`](../../../../test/wishlist.e2e-spec.ts), [`wishlist.integration-spec.ts`](../../../../test/wishlist.integration-spec.ts) y [`wishlist.service.spec.ts`](../../../../src/wishlist/wishlist.service.spec.ts) |
| Integración/QA | [#187](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/187), [#188](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/188) y [Frontend #92](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/92) |

## Contrato y decisiones resueltas

- `DELETE /api/v1/wishlist/items/{productId}` deriva el titular de la sesión G7; no acepta selección de `customerId`.
- Responde `204` tanto si elimina como si el favorito ya estaba ausente. La repetición conserva el mismo estado final.
- El borrado usa `(customerId, productId)`, por lo que un cliente B no puede eliminar el favorito de A.
- DELETE es una operación local: no consulta elegibilidad, stock ni catálogo, y no modifica el carrito.
- “Deshacer” no revierte una fila eliminada: realiza una nueva alta mediante F-036, vuelve a validar elegibilidad G6 y obtiene un nuevo `createdAt`.
- Si el producto fue retirado o G6 no puede confirmar elegibilidad, Deshacer falla cerrado y la UI debe restaurar/explicar el estado sin inventar éxito.

## Operación y errores

| Situación | Resultado público de G1 | Persistencia/cliente |
|---|---|---|
| Favorito propio existente | `204`, sin body | Elimina solo la fila del titular |
| Favorito ya ausente | `204`, sin body | Sin cambios; operación idempotente |
| Favorito del cliente A eliminado por B | `204`, sin revelar existencia | La fila de A permanece |
| Sesión ausente, inválida, expirada o revocada | `401 UNAUTHORIZED` | No elimina |
| Origen/CSRF inválido en sesión cookie | `403` | No elimina |
| `productId` inválido | `400 INVALID_PRODUCT_ID` | No elimina |
| Body, query o propietario inyectado | `400 INVALID_REQUEST` | No elimina |
| Fallo interno inesperado | `500 INTERNAL_ERROR` genérico | No filtra conexión ni detalle interno |
| Deshacer con producto activo | F-036: `201` o `200` | Nueva alta válida |
| Deshacer con producto retirado | F-036: `404 PRODUCT_NOT_AVAILABLE` | Permanece eliminado |
| Deshacer con G6 indisponible | F-036: `503 CATALOG_UNAVAILABLE` | Permanece eliminado |

## Matriz spec → código → pruebas → resultado → despliegue

| Criterio/decisión | Implementación | Prueba verificable | Resultado del corte | Despliegue |
|---|---|---|---|---|
| CA-F038-01: DELETE repetido deja la misma lista | `WishlistController.remove`, `WishlistService.remove`, `deleteMany` | `wishlist.e2e-spec.ts`: elimina dos veces | PASS local y CI | Recorrido desplegado pendiente |
| API-CA-F038-01: no borra favorito ajeno | filtro `(customerId, productId)` del repositorio | `wishlist.e2e-spec.ts`: cliente B contra fila de A | PASS con identidades controladas | Cuentas A/B autorizadas pendientes |
| No acepta body/query/propietario | controlador y validación global | `wishlist.e2e-spec.ts`: owner-selection y body DELETE | PASS sin tocar repositorio | Validación autenticada pendiente |
| DELETE no consulta catálogo | ruta `remove` sin `ProductEligibilityPort` | `wishlist.e2e-spec.ts`: producto no disponible | PASS; spy confirma cero consultas | No requiere G6 para DELETE |
| Undo crea una alta nueva y revalida | reutiliza F-036 `save` | QA #188: activo/restaurado y retirado/no restaurado | PASS controlado | Fixture G6 real pendiente |
| Persistencia e aislamiento | constraint e índice por titular/producto | `wishlist.integration-spec.ts` sobre PostgreSQL 16 temporal | PASS | SHA de BD/deployment pendiente |
| UI optimista, restauración y foco | implementación frontend vinculada a #92 | evidencia de Frontend #92 | En revisión | Recorrido UI desplegado pendiente |

## Evidencia, hallazgos y retest

- `test/wishlist.e2e-spec.ts`: **31/31 PASS** en el retest compartido de F-036/F-038.
- `wishlist.service.spec.ts` y `wishlist-read.service.spec.ts`: **10/10 PASS**; `npm run typecheck`: **PASS**.
- Los checks del PR para Node 22/24, build/test, sesión G7 y PostgreSQL aislado están aprobados en el corte `9fb17df`.
- Gitleaks no detectó secretos en fuente ni historial; SCA runtime registró cero vulnerabilidades. El riesgo residual de tooling se conserva para confirmación del revisor.
- El sondeo público seguro obtuvo `401` para DELETE anónimo y no concedió CORS a un origen ajeno. No se enviaron credenciales ni mutaciones válidas.
- No se ejecutó DAST intrusivo sobre Render productivo: OPS #206 lo limita a contenedores locales o staging aislado autorizado.
- Evidencia detallada: [F038 QA seguridad](F038-QA-SEGURIDAD-2026-11-05.md), [evidencia general](EVIDENCIA.md) y [reporte por issue](../../../QA-DIEGO-CIERRE-2026-11-03.md#issue-189).

## Pendientes para cerrar #189

1. Completar [#187](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/187): integración aplicable, fixture G6 real para Deshacer y trazas sanitizadas. DELETE local no requiere G6; esta no aplicabilidad debe quedar aceptada por el revisor.
2. Registrar URL y SHA/ID del deployment G1 y ejecutar el recorrido UI/API autorizado con cuentas A/B.
3. Obtener aprobación final de [Frontend #92](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/92) y [Backend #188](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/188), actualmente en revisión.
4. Obtener revisión independiente de Fernando Saire; si participa en el artefacto, solicitar una segunda revisión para esa parte.
5. Reemplazar los pendientes externos por enlaces a evidencia real y registrar hallazgo/retest final, si corresponde.

Con el trabajo documental propio completo, #189 puede pasar a **En revisión**. No debe cerrarse ni marcarse terminada hasta aprobar estos gates.
