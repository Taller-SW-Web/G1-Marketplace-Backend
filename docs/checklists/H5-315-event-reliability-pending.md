# H5-315 — confiabilidad de eventos: decisiones pendientes

**Estado:** bloqueado hasta disponer del contrato publicado. **Alcance de esta nota:** preparación local; no implementa ni habilita un consumer.

## Fuentes y límite

El alcance asignado a #315 es idempotencia por `eventoId`, reintentos con backoff y DLQ; su criterio de aceptación pide no procesar dos veces un duplicado y enviar un evento fallido a DLQ tras agotar reintentos. La dependencia #313 sigue abierta y no existe un acuerdo público. Estos requisitos delimitan el objetivo, pero no fijan por sí solos las decisiones operativas de implementación.

Este checkout no contiene una copia del texto completo de #315 ni del acuerdo #313. La búsqueda de archivos versionados y del historial local tampoco encontró un contrato RabbitMQ/eventos. `package.json` no declara un cliente AMQP y `src/` no contiene un consumer de eventos. No se consultó GitHub ni ningún servicio externo desde el agente, ni se conectó a RabbitMQ. No se presume esquema o payload, almacenamiento/clave/retención de idempotencia, clasificación de errores, cantidad o intervalo de reintentos, backoff concreto ni destino/routing/TTL de DLQ. No hay una pieza pura deducible sin ambigüedad que justifique código o tests ejecutables ahora.

## Decisiones que debe fijar el contrato

Antes de implementar estos tres puntos, una referencia publicada debe precisar, dentro del alcance de #315:

1. Idempotencia por `eventoId`: qué identifica un duplicado, durante cuánto tiempo se conserva el estado de deduplicación y cómo se relaciona con el efecto de negocio, incluidas las reentregas.
2. Reintentos con backoff: qué fallos son reintentables, cómo se cuentan los intentos, cuál es el límite y qué intervalos/backoff se aplican.
3. DLQ: en qué condición se envía el evento una vez agotados los reintentos y qué destino/routing requiere el contrato.

La semántica de confirmación/entrega sólo se concreta en la medida necesaria para cumplir y verificar esos requisitos. Los detalles de esquema, validación, orden, concurrencia, shutdown, retención o replay no amplían por sí mismos el alcance de #315: se consideran únicamente si el contrato publicado los requiere explícitamente para estos tres puntos. No completar decisiones con valores por defecto ni con convenciones de RabbitMQ.

## Matriz local, condicionada al contrato

No ejecutar estas comprobaciones hasta que el contrato esté publicado. Las aserciones y los valores parametrizados salen de ese contrato; esta tabla no define política.

| Caso | Comprobación local con dobles | Condición contractual previa |
| --- | --- | --- |
| Duplicado por `eventoId` | Reentregar el mismo `eventoId` y comprobar que no se aplica dos veces el efecto de negocio. Incluir concurrencia sólo si el contrato la contempla para esta garantía. | Identidad, garantía y ciclo de vida del estado de deduplicación; semántica de reentrega/confirmación cuando aplique. |
| Backoff/reintento | Inyectar un fallo que el contrato clasifique como reintentable y comprobar intentos y esperas. | Clasificación, límite de intentos y calendario/backoff. |
| Agotamiento y DLQ | Provocar el fallo contractual hasta agotar los reintentos y comprobar el envío a DLQ. | Definición de agotamiento y destino/routing requerido. |

La matriz usa dobles locales y no requiere RabbitMQ ni servicios externos. Cualquier prueba de broker queda fuera de esta nota y requiere autorización separada; no se asume como parte del contrato ni de #315.

## Patrones locales revisados

- Pruebas unitarias Jest con colaboradores simulados: `src/health/health.service.spec.ts`.
- La evidencia local distingue pruebas con dobles de integración real y declara sus límites: `docs/evidencias/H4/checkout-f026-f027-local.md`.
- No se añadió dependencia, configuración, migración ni código de integración.
