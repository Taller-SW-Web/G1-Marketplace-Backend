# #321 — Contrato de eventos

Registrar aquí los contratos publicados por G7 (`usuario.*`) y Ventas (`ShipmentStatusUpdated`), junto con ejemplos versionados y runs de productor/consumidor. No completar campos del payload por suposición: enlazar la definición fuente aprobada.

| Productor | Evento / destino observado | Versión / schema | Contrato fuente | Run productor | Run consumidor | Resultado |
|---|---|---|---|---|---|---|
| G7 | `usuario.creado` v1 leído de `marketplace.usuarios` (`usuario.*` binding) | v1 observado; schema aprobado por enlazar | [Acuerdo A SPECS #22](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/22); [evidencia de consumidor REAL #314](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314#issuecomment-7205557701) | Publicación/outbox: [BE #313](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/313), 25/11 23:07; recepción/recuperación reportada en #314 | Recuperación manual de tres mensajes originales desde DLQ con candidato #409; 1 fila por ID, no nueva publicación consumida automáticamente | REAL controlado; `eventId=5206c121-61e7-4de9-8fe9-0b11306c0daa` fue cotejado con outbox; falta adjuntar schema versionado y validar el evento post-fix de extremo a extremo |
| Ventas | `ShipmentStatusUpdated`; estados `DESPACHADO` (5) y `ENTREGADO` (2) recibidos por webhook | Pendiente | BE #318; schema/event payload pendiente | Enlace/run pendiente; 26/11 11:05:47–11:05:50 | Persistencia de 7 eventos reportada; permalink pendiente | REAL reportado; token inválido recibió 401; falta adjuntar contrato aprobado |

## Diagrama de publicación y consumo

```mermaid
flowchart LR
    G7[G7] -->|usuario.*| Broker[(RabbitMQ)]
    Broker -->|marketplace.usuarios| Consumidores[Consumidor G7]
    Ventas[Ventas] -->|ShipmentStatusUpdated| Webhook[Webhook de despacho]
    Webhook --> Persistencia[Persistencia de eventos]
```

## Campos de contrato a enlazar

Para cada evento, adjuntar el schema fuente y documentar: nombre y versión, clave de enrutamiento, payload, identificador de evento, `correlation-id`, política de reintento/duplicados y compatibilidad. Los valores y políticas deben salir del contrato aprobado.

| Evento | Tabla de campos / schema | Ejemplos válidos | Compatibilidad / versionado | Responsable |
|---|---|---|---|---|
| `usuario.creado` v1 / binding `usuario.*` | [Acuerdo A SPECS #22](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/22); el schema versionado detallado sigue pendiente | El sobre de v1 coincide en versión, tipo, routing key, fecha, `usuarioId` y datos; ver compatibilidad reportada en [BE #314](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314) | Pendiente de ligar al schema aprobado | G7 / consumidor |
| Evento de estado de Ventas (nombre por confirmar) | Pendiente | Pendiente | Pendiente | Pendiente |

La entrega/lectura de un mensaje real acredita el recorrido observado, pero no reemplaza el schema aprobado ni los ejemplos versionados. La evidencia de laboratorio con eventos sintéticos se registra aparte como **LAB LOCAL**.
