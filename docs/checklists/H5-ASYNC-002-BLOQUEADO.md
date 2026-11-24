# H5 ASYNC-002 — consumidor de eventos de Seguridad

**Estado: BLOQUEADO en la frontera del contrato/acuerdo con Seguridad.** No se implementa ni se conecta un consumidor RabbitMQ hasta que el contrato esté aceptado y el acuerdo de broker de TASK-H5-ASYNC-001 esté acreditado. Esta nota no es evidencia de integración ni de evento REAL.

## Alcance y fuentes revisadas

- [Issue #314](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314): sigue abierto. Pide un consumidor en la cola `marketplace.usuarios`, binding `usuario.*`, validación de esquema y versión. La aceptación pide consumir y registrar un evento publicado por Seguridad. Fecha objetivo H5: 20/nov/2026; prioridad P0.
- [Issue #313](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/313): sigue abierto y no consta un acuerdo público con Seguridad sobre host/vhost, credenciales, cola y publicador de prueba. La aceptación pide acuerdo escrito y entrega de credenciales de prueba por canal seguro.
- [Catálogo de eventos de Seguridad](https://github.com/Taller-SW-Web/Modulo-de-Seguridad/blob/main/specs/catalogo-eventos.md), blob `2df4b484f3218120afc9817433a1a4420c22f631`: está publicado, pero su propio estado es **Borrador — pendiente de acuerdo con los seis equipos** y dice **Marketplace: ninguno** en consumidores. Describe un sobre con `eventoId`, `tipo`, `version` (empieza en `1`), `fecha`, `usuarioId` y `datos`; topología propuesta: exchange `seguridad.usuarios`, cola propia `<modulo>.usuarios` y binding sugerido `usuario.*`. No equivale a homologación del contrato para Marketplace.
- [PR #46 del backend de Seguridad](https://github.com/Taller-SW-Web/Modulo-de-Seguridad-Backend/pull/46), fusionado a `develop`: documenta publicador/outbox, mensajes JSON persistentes, `messageId = eventoId` y confirmación del broker. Es implementación del productor, no acuerdo de consumo de Marketplace ni evidencia de este backend.
- Búsqueda local en este backend: no hay consumidor RabbitMQ/AMQP ni dependencia asociada. Hay idempotencia de Checkout y `X-Correlation-Id` en fronteras HTTP, pero no son patrones de entrega/ack de mensajes y no se trasladan como contrato.
- [Issue #315](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/315) requiere idempotencia por `eventoId`, backoff y DLQ; [#316](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/316) describe reacciones a bloqueo, eliminación y cambio de rol; [#321](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/321) deja la documentación del contrato/esquemas como tarea H5.

Los issues remiten además a `reparto.md` e `issues-h5.md`, que no están versionados en este backend. No se les atribuyen decisiones adicionales.

## Decisiones/gates pendientes

- [ ] Seguridad y Marketplace aceptan una versión concreta del catálogo; registrar responsable, fecha y revisión. Resolver si el borrador publicado es la base vigente o debe actualizarse.
- [ ] Publicar un esquema verificable (incluidos campos requeridos/opcionales, nulabilidad, tipos/formato y restricciones por evento) y política para versiones desconocidas. El catálogo describe el sobre y ejemplos, pero no aporta un esquema ejecutable aprobado.
- [ ] Confirmar eventos y nombres que recibirá Marketplace. El catálogo enumera `usuario.desactivado`; #316 habla de “eliminado”. No inferir un routing key como `usuario.eliminado` ni mapear nombres sin decisión del proveedor.
- [ ] Confirmar topología efectiva y propiedad: exchange, cola `marketplace.usuarios`, binding, vhost/host y entorno. Compartir cualquier credencial sólo por canal seguro; no copiarla a este repo.
- [ ] Acordar semántica de entrega del consumidor: ack/nack y redelivery (incluidos requeue y límites/conteo de intentos), reintentos/backoff, cuándo enviar a DLQ, retención y recuperación. El catálogo borrador menciona DLQ tras 3 reintentos; #315 no fija el número y PR #46 describe reintentos del **publicador**, no la política del consumidor.
- [ ] Acordar deduplicación durable por `eventoId`, retención y transacción con el efecto. Definir cómo aplicar `fecha` para eventos fuera de orden por usuario.
- [ ] Definir qué significa “registrado” para la aceptación de #314 (almacenamiento/observabilidad) y qué datos se pueden registrar, con redacción de PII.

## Pruebas deterministas pendientes (offline, sin broker)

Preparar sólo después de aceptar contrato y política; usar fixtures explícitos derivados de la versión aprobada y etiquetarlos como **datos de prueba**, nunca como tráfico REAL.

- [ ] Positivos por cada evento/routing key que se acuerde: sobre v1 completo, fechas UTC, `datos` válido y propiedades opcionales/nulas según esquema.
- [ ] Negativos: JSON inválido; campos requeridos ausentes; tipos/formato inválidos; mismatch entre `tipo` y routing key; versión ausente/no soportada. Afirmar el resultado esperado sólo cuando se acuerde ack/retry/DLQ.
- [ ] Compatibilidad: campos adicionales ignorados y evento desconocido ignorado, según el catálogo; confirmar cómo se confirma al broker antes de fijar la prueba de settlement.
- [ ] Duplicado: mismo `eventoId` no repite el efecto, incluida repetición después de reinicio/recuperación; distinto `eventoId` sí se procesa.
- [ ] Orden: evento antiguo para el mismo `usuarioId` no revierte una proyección más nueva, usando reloj/datos controlados y la regla aprobada.
- [ ] Política de fallos: retry/backoff/DLQ con reloj y transporte falsos inyectados, sin RabbitMQ ni evidencia REAL; incluir recuperación sin pérdida según la política acordada.
- [ ] Sanitización: logs no exponen credenciales ni atributos personales no autorizados; correlación sólo con campos acordados.

## Frontera de evidencia

Hasta resolver los gates anteriores: no añadir dependencias RabbitMQ, variables/credenciales, infraestructura, consumidor, schema propio ni fixtures que aparenten representar tráfico real. No afirmar integración ni despliegue. Cuando se autorice la integración, reportar por separado pruebas unitarias con fixtures, integración REAL con proveedor/versión y mensaje sanitizado, y verificación del despliegue, de acuerdo con #314.

## Revisión offline — 24/nov/2026

- Se mantiene **BLOQUEADO**: el catálogo consultado está marcado borrador y Marketplace no figura como consumidor acordado; la topología descrita es sugerida, no una configuración aprobada.
- La implementación del publicador/outbox de Seguridad no sustituye el acuerdo de consumo. Host/vhost, cola/binding, contrato ejecutable/versiones, ack/nack/redelivery, retry/backoff/DLQ, deduplicación durable, orden y sanitización siguen siendo decisiones de frontera.
- No se conectó a RabbitMQ, no se probaron credenciales, no se añadieron dependencia/configuración/consumidor ni fixtures de tráfico. No se ejecutó una prueba de integración offline que pretenda fijar settlement antes de acordar la política.
- La salida de este corte es documental solamente; no cambia el estado registrado de #313/#314/#315 ni acredita un evento recibido.
