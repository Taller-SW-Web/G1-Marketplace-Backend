# F-026 — paquete de revisión BE/INT/QA/DOC

**Corte:** 27-nov-2026 · Base revisada: `develop` `24cbe9c71464034e09004a2816e99ece5f5e7562`. Este paquete traza trabajo integrado y gates pendientes; no cierra las issues ni afirma que todos los criterios de F-026 estén satisfechos.

## Diseño, operación y errores documentados

- **Fuentes funcionales/técnicas:** [seguimiento F-026](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/plan/seguimiento/F-026-crear-orden-ventas.md), desde donde se enlazan specs funcional, API, UI y React. El frame visual de creación/estado es **V-013** en el [canvas Checkout de Figma](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=1-5&p=f&t=PXeKrikbDjSdUQ5l-0); es referencia, no aprobación visual.
- **Operación:** G5 queda detrás de configuración opt-in; el backend persiste `CheckoutOperation`, y ante resultado incierto recupera consultando por la operación/clave existente. El replay usa la misma clave y no debe iniciar un segundo POST cuando el ID externo ya quedó persistido. La ejecución/activación en un entorno compartido queda sujeta a autorización y gates de INT.
- **Errores y límites:** timeout/resultado incierto no equivale a fallo definitivo ni autoriza crear otro pedido; `FAILED` no equivale a pedido completado; un error del proveedor y la indisponibilidad deben informarse como tales, sin exponer credenciales, PII ni datos sensibles. Las pruebas locales con dobles no demuestran respuesta real de Ventas ante negativos o timeout.
- **Decisiones registradas:** la compra reportada corresponde a la ruta BFF→Ventas; cotización y revalidación se marcaron MOCK. No se atribuye esa evidencia a G2/G6 ni se infiere despliegue desde pruebas locales/CI.

## Código y pruebas integradas

| Tarea | Artefacto / evidencia | Qué demuestra y clasificación |
|---|---|---|
| BE #131 | `src/checkout/checkout.service.ts`, adaptador `src/checkout/external/`; [PR #366](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/366) | Adaptador G5 detrás de configuración opt-in; código integrado. No habilita configuración/despliegue por sí mismo. |
| DB #132 | [Issue #132](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/132), cierre/aprobación de Diego; evidencia PostgreSQL enlazada desde [PR #235](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/235) | Modelo común `CheckoutOperation`, ownership, constraints y persistencia revisados. PostgreSQL 16.15 desechable: 4 suites/40 pruebas en el reporte de #235. **LAB LOCAL**, Ventas MOCK; #132 está cerrada. |
| Recuperación/idempotencia | [PR #402](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/402), `test/checkout-orders.integration-spec.ts` | 9/9 en PostgreSQL 16 desechable con Ventas MOCK: el ID externo queda persistido, se consulta por ID, se recupera con la misma clave y no se repite el POST tras obtener el ID. |
| CI de integración | [PR #383](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/383), [job PostgreSQL 16](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45940874364/job/140314869858) | CI incluye `checkout-orders.integration-spec.ts` y pasó. Dobles HTTP deterministas/PostgreSQL desechable; **no** es llamada real a G5. |
| FE asociado | [PR FE #181](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/181), [#183](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/183), [#131](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/131) | Modo BFF opt-in, recuperación explícita con misma operación/clave, cobertura FE de timeout/error. Paquete de evidencia FE: [PR documental #187](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/187). |

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

- PR #366, #235, #402 y #383 están mergeadas. Los checks de la PR #425 terminaron en verde en [run 46008814452](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46008814452), [run 46008814498](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46008814498), [run 46008814461](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46008814461) y [run 46008814848](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46008814848). Los jobs de versionado/publicación quedaron omitidos por tratarse de un evento PR.
- En esta copia local faltan `node_modules` (`@swc/jest` y `tsc`), por lo que no se repitieron Jest ni typecheck localmente. No se cambiaron dependencias ni se modificó configuración para forzar la ejecución. La evidencia de CI anterior se cita por separado.
- La PR #425 está abierta para la revisión formal. Las PRs citadas y mergeadas solo admiten revisión retrospectiva; no pueden recibir `requested_reviewers` como PR abierta. Falta aprobación independiente de esta PR por Diego y resolver/registrar sus comentarios.

**Conclusión:** las bases de código y evidencia local están integradas, pero el paquete no convierte #133/#134 en DoD completo. Solicitar revisión independiente del código/evidencia; mantener #133 y #134 abiertos hasta la evidencia faltante o aceptación explícita del alcance.
