# Receptor H-05 de Ventas — estado de implementación

**Issue:** [Backend #319](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/319)  
**Contrato operativo comunicado por el equipo:** `POST /api/v1/webhooks/ventas/envios`, header `X-Webhook-Token`.

## Contrato que implementa G1

- Evento `ShipmentStatusUpdated`, versión `1.0.0`, emisor `modulo-ventas`.
- `eventId` es UUID y es la llave idempotente. No usar `idEvento`.
- `timestamp` es ISO-8601 UTC. `data` contiene `orderId` (`PED-AAAA-NNNNN`), `publicStatus` (`DESPACHADO` o `ENTREGADO`), `trackingNumber` y `estimatedDeliveryDate` (`YYYY-MM-DD` o `null`).
- 202 para aceptar el evento; un duplicado idéntico también responde 2xx. Reusar el UUID con otro contenido responde 409. Payload inválido responde 422. Token ausente/incorrecto responde 401; falta de configuración local del secreto responde 503.
- El recibo se persiste antes de responder, incluyendo eventos cuyo pedido todavía no se puede asociar a una operación local. El evento queda disponible para la proyección de tracking y para conciliación posterior.
- Para una compra G1 asociada y con destinatario cifrado, el evento añade una entrega C-002 a la outbox. Esto confirma el encolado, no la entrega del correo; worker y proveedor siguen siendo una dependencia aparte.
- G5 informa reintentos cada 5 s, hasta 10 veces ante 5xx, 401, 403, 404 o timeout. El receptor debe persistir rápido y no hacer una llamada lenta a otro módulo sincrónicamente.

## Configuración

`G5_SHIPMENT_WEBHOOK_TOKEN` contiene el secreto compartido. En local se puede definir como variable de entorno; en Render se declara como secreto y el valor se configura en el panel privado. Nunca guardarlo en el repo, logs o capturas.

## Alcance de la evidencia

Implementación local en la rama `codex/h5-319-fernando`. `npm run build` pasó el 24/11/2026. No se ejecutaron pruebas. Este documento no afirma una URL de Render activa, configuración de secretos, recepción real desde G5 ni entrega real de email. Completar esos datos después del smoke coordinado con el responsable de Render y Ventas.
