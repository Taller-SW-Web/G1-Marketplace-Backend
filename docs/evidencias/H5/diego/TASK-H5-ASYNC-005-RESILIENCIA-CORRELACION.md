# TASK-H5-ASYNC-005 (`BE #317`): Observabilidad, correlación y recuperación del consumidor RabbitMQ

- **Issue:** [BE #317](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/317)
- **Responsable:** `@DiesmEsp` · **Revisor:** `@saire22`
- **Base:** construido sobre `BE #316` (`feat/h5-316-async-user-reactions` / PR `#389`)

## 1. Logs estructurados con `correlationId` (sin PII) y métricas

En [security-user-event-consumer.service.ts](../../../src/security-events/security-user-event-consumer.service.ts):
- `sanitizeCorrelationId` extrae `message.properties.correlationId` o `headers['x-correlation-id']` (fallback: `event.eventId`), sanitizado a `[A-Za-z0-9._:-]{1,64}` sin PII ni secretos.
- Se exponen métricas en tiempo real mediante `getMetrics()` (`SecurityUserEventMetrics`):
  - `processedTotal`, `duplicateTotal`, `ignoredUnknownTotal`, `retriedTotal`, `deadLetteredTotal`, `reconnectsTotal`, `lastEventId`, `lastProcessedAt`.
- Eventos JSON emitidos en logs:
  - `security_user_consumer_connected` / `security_user_consumer_reconnected`
  - `security_user_event_processed` / `security_user_event_duplicate`
  - `security_user_event_ignored_unknown` / `security_user_event_retried` / `security_user_event_dead_lettered`

## 2. Simulación unitaria y prueba de integración en PostgreSQL 16

- **Simulación unitaria (`src/security-events/security-user-event-recovery.spec.ts`):** valida en memoria la caída del canal, acumulación de 3 mensajes en cola durable, reconexión y drenado sin duplicar efectos (`processedTotal = 3`, `duplicateTotal = 1`, `reconnectsTotal = 1`).
- **Prueba de integración sobre PostgreSQL 16 (`test/security-user-event-recovery.integration-spec.ts`):** ejecutada en CI sobre PostgreSQL 16 desechable con `SecurityUserEventConsumerService` + `SecurityUserReactionService` + `SecurityUserEventInboxService`:
  1. Procesa `evt1` (`usuario.bloqueado`, `corr-pg-001`) → `processedTotal = 1`, purga favoritos del usuario A y registra `BLOCKED`.
  2. Cierra el canal simulando caída del consumidor mientras 3 mensajes quedan pendientes en cola (`evt1` redelivery, `evt2` `corr-pg-002`, `evt3` `corr-pg-003`).
  3. El consumidor **reconecta automáticamente** por timer (`scheduleReconnect`), drena los 3 mensajes pendientes y PostgreSQL (`security_user_event_inbox`) registra cada `eventId` **una sola vez** (`count = 3`), sin repetir efectos ni degradar el bloqueo vigente (`processedTotal = 3`, `duplicateTotal = 1`, `reconnectsTotal = 1`).

```text
LOG [SecurityUserEventConsumerService] {"event":"security_user_consumer_connected","reconnectsTotal":0}
LOG [SecurityUserEventConsumerService] {"event":"security_user_event_processed","correlationId":"corr-001","eventId":"11111111-1111-4111-8111-111111111111","eventType":"usuario.bloqueado","processedTotal":1}
WARN [SecurityUserEventConsumerService] RabbitMQ reconnect scheduled after 1000ms
DEBUG [SecurityUserEventConsumerService] {"event":"security_user_event_duplicate","correlationId":"corr-001-redelivery","eventId":"11111111-1111-4111-8111-111111111111","eventType":"usuario.bloqueado","duplicateTotal":1}
LOG [SecurityUserEventConsumerService] {"event":"security_user_event_processed","correlationId":"corr-002","eventId":"22222222-2222-4222-8222-222222222222","eventType":"usuario.roles_cambiados","processedTotal":2}
LOG [SecurityUserEventConsumerService] {"event":"security_user_event_processed","correlationId":"corr-003","eventId":"33333333-3333-4333-8333-333333333333","eventType":"usuario.bloqueado","processedTotal":3}
LOG [SecurityUserEventConsumerService] {"event":"security_user_consumer_reconnected","reconnectsTotal":1}
```

## 3. Verificación
- `npm run lint` (`tsc --noEmit`): **PASS** (`0` errores)
- `npm run test:unit`: **PASS** (`64/64` suites, `733/733` tests)
- CI PostgreSQL 16 (`test/security-user-event-recovery.integration-spec.ts`): enlazado en el comentario de revisión de PR `#390`.
