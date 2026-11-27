# TASK-F033-INT-001 — renderer de notificaciones y C-002

**Fecha de registro:** 2026-11-27
**Estado:** Backend #162 permanece `open / Bloqueado`. Este artefacto no cambia estado, labels, DoD ni dependencias.

## Evidencia existente de C-002

La prueba descrita en el [comentario #7204545580 de #162](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/162#issuecomment-7204545580) corresponde al pedido QA `PED-2026-90001` y al eventId `c53403f0-a940-44d6-a3f1-4652d301e99a`:

| Hora UTC | Registro de la evidencia existente |
| --- | --- |
| 22:07:59 | Jim confirmó el envío inicial del evento sintético `DESPACHADO`. |
| 22:08:37 | Los logs de Render registraron un envío de `C002QaWorker` con estado `sent` y HTTP 201 de Brevo para ese eventId. |
| 22:09:12 | Tras el reenvío del mismo eventId, Giuliano confirmó un solo correo total en el buzón QA; no se observó duplicado. |

Este resultado es una prueba puntual de C-002. El evento pertenece al corte anterior de Render `f17896d7ee24876ffd33db1bb7dd91d65623ed37`; esa referencia histórica no identifica el SHA live actual. No se inspeccionó el buzón ni se repitió el envío para preparar este artefacto.

El [comentario #7197610742 de #162](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/162#issuecomment-7197610742) conserva el plan de coordinación y las comprobaciones que se solicitaron antes de la ventana QA. No se reproducen valores privados de configuración. La existencia de un C-002 enviado no demuestra por sí sola el cierre completo del contrato/configuración G-MAIL.

## Decisión de alcance de H5

En el [comentario #7211248767 de #161](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/161#issuecomment-7211248767), Jim acepta para H5 el renderer Backend actual que genera HTML y texto desde el snapshot de notificación y que produjo los correos C-002 observados. La decisión excluye de H5 el endpoint `POST /internal/v1/notifications/render` y la capa React; no los declara implementados. La propia decisión deja pendiente confirmación de Leonidas y Sebastián.

Esto registra una decisión de alcance, no una aceptación técnica independiente de #161 ni el cierre de #162. BE #161 sigue `open / Pendiente`; [PR #352](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/352) está integrada según el preflight.

## Pendientes de integración

- **C-001 `PAGADO`:** queda para el siguiente corte y continúa pendiente de homologación.
- **G-MAIL:** sigue pendiente documentar el cierre completo de contrato y configuración; la planificación de la ventana C-002 no acredita todos esos gates.
- **C-001, negativos y timeouts:** los comentarios seleccionados no contienen una homologación completa de C-001 ni evidencia de negativos/timeouts autorizados. Esos criterios siguen pendientes.
- **Revisión y aceptación:** falta confirmación independiente de Leonidas/Sebastián aplicable a #161 y aceptación de los criterios restantes de #162.

#162 conserva la dependencia formal con [BE #161](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/161) y G-MAIL, y permanece abierta/bloqueada. No se ejecutaron pruebas, requests de servicio, envíos, emisiones de evento ni consultas de buzón para preparar este resumen. Las afirmaciones de resultado se limitan a los tres comentarios enlazados.
