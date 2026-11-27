# F-026 — paquete de revisión BE/INT/QA/DOC

**Corte:** 27-nov-2026 · Base revisada: `develop` `24cbe9c71464034e09004a2816e99ece5f5e7562`. Este paquete traza trabajo integrado y gates pendientes; no cierra las issues ni afirma que todos los criterios de F-026 estén satisfechos.

## Código y pruebas integradas

| Tarea | Artefacto / evidencia | Qué demuestra y clasificación |
|---|---|---|
| BE #131 | `src/checkout/checkout.service.ts`, adaptador `src/checkout/external/`; [PR #366](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/366) | Adaptador G5 detrás de configuración opt-in; código integrado. No habilita configuración/despliegue por sí mismo. |
| DB #132 | [Issue #132](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/132), cierre/aprobación de Diego; evidencia PostgreSQL enlazada desde [PR #235](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/235) | Modelo común `CheckoutOperation`, ownership, constraints y persistencia revisados. PostgreSQL 16.15 desechable: 4 suites/40 pruebas en el reporte de #235. **LAB LOCAL**, Ventas MOCK; #132 está cerrada. |
| Recuperación/idempotencia | [PR #402](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/402), `test/checkout-orders.integration-spec.ts` | 9/9 en PostgreSQL 16 desechable con Ventas MOCK: el ID externo queda persistido, se consulta por ID, se recupera con la misma clave y no se repite el POST tras obtener el ID. |
| CI de integración | [PR #383](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/383), [job PostgreSQL 16](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45940874364/job/140314869858) | CI incluye `checkout-orders.integration-spec.ts` y pasó. Dobles HTTP deterministas/PostgreSQL desechable; **no** es llamada real a G5. |
| FE asociado | [PR FE #181](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/181), [#183](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/183), [#131](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/131) | Modo BFF opt-in, recuperación explícita con misma operación/clave, cobertura FE de timeout/error. El paquete FE complementario se prepara en su propia PR documental; enlazarla aquí cuando se abra. |

## Evidencia REAL reportada — sin repetir la compra

La [evidencia sanitizada de compra](../H5/integracion-real/compra/2026-11-26/REAL-2026-11-26T20-05-16.062Z-6afb7c7c.md) y el comentario de G1 en [issue #295](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/295) reportan creación de pedido contra Ventas desde el BFF, lectura posterior `PAGADO` y replay con la misma clave que devolvió el mismo pedido sin duplicarlo. Se clasifica **REAL reportada por el equipo**, no reproducción independiente de esta revisión. No se creó ni reintentó ningún pedido para este paquete.

Ese informe marca explícitamente **cotización y revalidación MOCK**; no las atribuimos a F-026 ni a prueba real de G2/G6. Las pruebas #235/#402/#383 son **LAB LOCAL/CI con dobles MOCK**.

## Matriz de criterios pendientes

| Issue | Cubierto para revisión | Sigue pendiente / no afirmar |
|---|---|---|
| BE #131 | Transiciones, clave/fingerprint, recuperación de operación y persistencia enlazadas a código/tests. | Revisión independiente específica de F-026; el merge de PRs no equivale a aprobación de la issue. |
| INT #133 | Contrato G5 `POST /api/v1/pedidos`, `Idempotency-Key`, scope y reporte REAL positivo/replay reportado enlazados. | El criterio completo pide positivo, negativo y timeout autorizados con contrato/configuración/entorno. No hay evidencia atribuible de los negativos/timeout reales; se dejan **NOT_RUN**. El reporte externo no se vuelve reproducción independiente. |
| QA/DevSecOps #134 | Pruebas deterministas locales de ownership/idempotencia/recuperación en #235/#402; CI y escaneos del head constan en #383. | Los tests de integración usan dobles. No acreditan abuso contra G5 real ni DAST específico de F-026 en staging; ejecución REAL/DAST específica **NOT_RUN**. |
| DOC #135 | Código, pruebas, estado externo, clasificación y límites están trazados en este paquete y en la matriz común. | Revisión independiente y cualquier ajuste solicitado por el revisor. |

## Validación de esta preparación

- Consulta GitHub: PR #366, #235, #402 y #383 están mergeadas; CI de #402/#383 pasó. El job local de PostgreSQL no se repitió desde esta copia.
- En el worktree BE disponible faltan `node_modules` (`@swc/jest` y `tsc` no están instalados), por lo que Jest/typecheck local no pudieron ejecutarse aquí. No se cambiaron dependencias ni se modificó configuración para forzar la ejecución.
- Para revisión formal de código, el nuevo cambio documental debe ir en una PR abierta. Las PRs citadas ya mergeadas solo admiten revisión retrospectiva; no pueden recibir `requested_reviewers` como PR abierta.

**Conclusión:** las bases de código y evidencia local están integradas, pero el paquete no convierte #133/#134 en DoD completo. Solicitar revisión independiente del código/evidencia; mantener #133 y #134 abiertos hasta la evidencia faltante o aceptación explícita del alcance.
