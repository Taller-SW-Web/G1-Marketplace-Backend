# H5-315 — confiabilidad del consumidor de eventos

**Estado: implementación local; integración REAL pendiente.** La [issue #315](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/315) cubre la extensión de confiabilidad del consumer de [#314](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314). La evidencia REAL requiere el broker autorizado y un evento del publisher de Seguridad; no se conectó ni se desplegó en este corte.

## Comportamiento implementado

- Inbox durable en PostgreSQL (tabla introducida por #314) con unicidad por ID de evento. Un duplicado del mismo ID y fingerprint se confirma sin volver a registrarlo; el mismo ID con tipo, versión o contenido distinto se envía a DLQ.
- El consumidor usa ack manual. Sólo confirma el mensaje original después de confirmar la publicación persistente a una retry queue/DLQ o tras registrar/identificar el duplicado en la base.
- Errores de validación/versión y conflicto de identidad son permanentes y van directamente a DLQ. Fallos al persistir se reintentan; al agotar el límite se envían a DLQ.
- Las retry queues son durables y separadas por tipo y número de reintento. Cada una usa TTL y dead-letters de vuelta a `seguridad.usuarios` con la routing key original. El código declara las colas al habilitar el consumidor.
- Configuración por entorno: `SECURITY_EVENTS_MAX_RETRIES`, `SECURITY_EVENTS_BACKOFF_BASE_MS`, `SECURITY_EVENTS_BACKOFF_MAX_MS` y `SECURITY_EVENTS_DLQ_QUEUE`. Valores iniciales locales: 3 reintentos, backoff exponencial 1 s / 2 s / 4 s y tope 30 s. Son configurables y deben coincidir con el acuerdo final publicado en SPECS antes de activar el entorno.
- No se persiste el payload ni `usuarioId`; el inbox conserva sólo el ID, tipo, versión, fingerprint y fecha de recepción.
- Las reacciones funcionales (invalidación de acceso y purga de datos) están especificadas por separado en [#316](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/316) y no se declaran cerradas por esta capa de confiabilidad.
- La idempotencia aquí cubre recepción y registro del evento; no acredita ejecución idempotente de los efectos de dominio de #316.

## Validación local

- `npm run test:unit`: 53 suites, 635/635 tests PASS; incluye backoff, límites de intentos, nombres/topología de retry queues, idempotencia y confirmación antes del ack.
- `npm run typecheck`: PASS; `npm run build`: PASS; `prisma validate` con URL sintética: PASS.
- Sin conexión RabbitMQ ni PostgreSQL; no se aplicó la migración. Estas pruebas no acreditan DLX/TTL real del broker.

## Pendiente para cierre REAL

- Confirmar en G1 SPECS el campo de identidad (`eventId` en el mensaje de coordinación vs `eventoId` en el issue/catálogo publicado), número/intervalos de retry y nombre de DLQ. Los valores de código son configurables y no sustituyen el acuerdo.
- Inyectar `RABBITMQ_URL` desde el secret store, confirmar permisos para declarar retry queues y ejecutar los casos positivo, duplicado, fallo/reintento y agotamiento/DLQ con el publisher de prueba.
- Aplicar la migración sólo mediante el despliegue autorizado a la base del entorno de prueba y adjuntar evidencia sanitizada; no marcar como integrada por estas pruebas locales.
