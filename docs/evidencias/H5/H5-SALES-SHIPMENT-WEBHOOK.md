# H5 — receptor local del webhook de Ventas

## Contrato y seguridad

- Ruta preparada: `POST /api/v1/webhooks/ventas/envios`.
- Evento: M1 `pedidos.envio.estado_actualizado`, `ShipmentStatusUpdated`, versión `1.0.0`; deduplicación por `eventId` según la especificación G1 F-035.
- El header de autenticación es configurable con `VENTAS_WEBHOOK_HEADER` (default `authorization`) y el valor esperado con `VENTAS_WEBHOOK_TOKEN`. El token es obligatorio; la ausencia de configuración responde 503 y no hay secreto por defecto. El header se compara exactamente como lo envía G5; si su valor incluye un prefijo, ese prefijo debe formar parte del valor configurado.
- Validación local de `eventId`, `eventType`, versión, timestamp, emisor, pedido `PED-YYYY-NNNNN`, estado público y fecha estimada. Los errores no incluyen payload sensible ni token.

## Idempotencia y límite de ejecución

- El controller delega en `ShipmentEventSink.accept(event)`, cuyo contrato exige persistir/deduplicar por `eventId` y encolar atómicamente.
- El sink productivo por defecto responde 503: no hay aún store duradero/outbox implementado. No se añadió migración ni se usa la `NotificationDelivery` existente, porque faltan una resolución documentada de pedido→cliente/destinatario y datos cifrados requeridos por ese modelo.
- La suite sustituye el sink por un doble local que demuestra aceptación y repetición sin reprocesar. Esa prueba no acredita deduplicación durable ni entrega bilateral.
- No se afirma acuerdo nuevo sobre ACK/reintentos, backoff, URL real o correlación extremo a extremo. G2 Specs #42 y los gates de #318 permanecen abiertos.

## Prueba

```text
npx jest --runInBand --runTestsByPath src/webhooks/ventas/shipment-webhook.spec.ts
```

HTTP de Nest en memoria, configuración y token sintéticos; no se llama a Ventas/G5 ni a RabbitMQ.
