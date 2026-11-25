# H5-314 — consumidor de eventos de Seguridad

**Estado: implementación local; integración REAL pendiente.** G1 administrará el broker de pruebas y construirá el consumidor. Este documento no afirma conexión ni integración REAL.

## Contrato y topología usados para el primer corte

- Issue [#314](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314): consumir, validar y registrar eventos de Seguridad desde `marketplace.usuarios`.
- El alcance de #314 termina en consumo, validación y registro idempotente. Las reacciones de dominio (invalidar acceso y purgar carrito/favoritos) pertenecen a la issue separada [#316](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/316); este consumer no afirma implementarlas ni cerrar esa issue.
- Topología indicada para el broker de G1: exchange topic durable `seguridad.usuarios`, cola durable `marketplace.usuarios`, binding `usuario.*` y cola de descarte. El código declara/asegura exchange, cola y binding al iniciar; `SECURITY_EVENTS_ENABLED` permanece desactivado por defecto.
- La última referencia publicada de Seguridad describe el sobre v1 con `eventoId`, `tipo`, `version`, `fecha`, `usuarioId` y `datos`; se validan los siete tipos publicados y se ignoran tipos desconocidos después de validar el sobre común.
- **Discrepancias por resolver en SPECS:** el mensaje de coordinación usa `eventId`, mientras el issue #315 y el catálogo de Seguridad usan `eventoId`; además, #316 menciona `eliminado` y el catálogo publicado `desactivado`. El código lee `eventoId` y reconoce `usuario.desactivado` según el catálogo; no mapea `desactivado` a una baja irreversible ni ejecuta efectos de dominio sin acuerdo explícito.
- La tabla `security_user_event_inbox` guarda solo identificador, tipo, versión, fingerprint SHA-256 y fecha de recepción; no persiste el payload ni `usuarioId`. La PK evita registrar dos veces el mismo identificador y un mismo ID con contenido distinto se trata como conflicto.

## Implementación local

- `src/security-events/security-user-event.ts`: validación del sobre y payloads v1, tipo/routing key, fecha UTC y versión.
- `src/security-events/security-user-event-consumer.service.ts`: consumidor manual-ack, conexión opt-in por `RABBITMQ_URL`, confirmación de publicación a DLQ y reconexión con backoff; no registra URL ni credenciales en logs.
- `src/security-events/security-user-event-inbox.service.ts`: registro durable mínimo e idempotencia por ID.
- La política de reintentos de fallos transitorios, backoff y agotamiento hacia DLQ se desarrolla en #315; no desplegar #314 aislada como versión final del flujo.

## Pendiente para integración REAL

- Publicar en G1 SPECS el sobre de evento acordado, nombre exacto del ID, reglas de versión/campos y semántica de retries/DLQ. La rama local de SPECS aún no contiene ese acuerdo.
- Incorporar en el gestor de secretos del entorno de prueba `RABBITMQ_URL` (nunca en Git) y confirmar que la topología del broker mantiene el DLX `seguridad.usuarios.dlx` con routing key `descartado` hacia `seguridad.usuarios.dlq`.
- Ejecutar integración autorizada con el publisher de Seguridad; comprobar evento, persistencia, duplicado, error y DLQ, y registrar evidencia sanitizada. Las pruebas locales no sustituyen esa evidencia.

## Validación local de este corte

- Typecheck: PASS.
- Unitarias focalizadas (parser, inbox y variables de entorno): 43/43 PASS.
- `prisma validate`: PASS usando URL sintética; no se conectó a PostgreSQL ni se aplicó la migración.
- Sin conexión RabbitMQ, llamadas de negocio ni secretos locales.
