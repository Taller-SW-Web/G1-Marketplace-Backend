# #325 — Arquitectura C4 de la compra

Vistas de contexto, contenedores y componentes para los sistemas confirmados: APIM, Marketplace BFF, RabbitMQ, consumidor de usuarios y webhook de Ventas. Las relaciones marcadas con evidencia enlazan a corridas o reportes; las conexiones de contexto no implican que todos los saltos se hayan medido en una sola traza distribuida.

## Contexto — sistemas y actores

```mermaid
flowchart LR
    Customer[Persona compradora]
    APIM[APIM — gateway]
    Marketplace[Marketplace]
    G7[G7 Seguridad]
    Rabbit[(RabbitMQ)]
    Sales[Ventas]

    Customer -->|API de compra / lectura| APIM
    APIM --> Marketplace
    Marketplace -->|checkout y consultas de pedidos| Sales
    G7 -->|usuario.creado v1| Rabbit
    Rabbit -->|marketplace.usuarios| Marketplace
    Sales -->|ShipmentStatusUpdated| Marketplace
```

## Contenedores — unidades desplegables observadas

```mermaid
flowchart LR
    APIM[APIM — gateway]
    BFF[Marketplace BFF]
    G7[G7 — productor de usuarios]
    Rabbit[(RabbitMQ — exchange / cola marketplace.usuarios)]
    Consumer[Marketplace — consumidor / inbox]
    SalesAPI[Ventas — API de pedidos]
    SalesWebhook[Ventas — productor de webhook]
    Webhook[Marketplace — endpoint de webhook]
    Store[(Persistencia de eventos)]

    APIM -->|HTTP| BFF
    BFF -->|POST checkout / GET orders| SalesAPI
    G7 -->|usuario.creado v1; routing usuario.*| Rabbit
    Rabbit -->|entrega a marketplace.usuarios| Consumer
    SalesWebhook -->|ShipmentStatusUpdated| Webhook
    Webhook --> Store
```

## Componentes — responsabilidades dentro del Marketplace

```mermaid
flowchart LR
    APIM[APIM]
    subgraph Marketplace[Marketplace]
        Routes[Controladores BFF / rutas]
        SalesAdapter[Adaptador de Ventas]
        RabbitConsumer[Consumidor RabbitMQ]
        Inbox[Inbox / deduplicación]
        HookHandler[Handler del webhook]
        EventStore[Persistencia de eventos]
    end
    Sales[Ventas]
    Broker[(RabbitMQ)]

    APIM --> Routes
    Routes --> SalesAdapter
    SalesAdapter --> Sales
    Broker --> RabbitConsumer
    RabbitConsumer --> Inbox
    Sales --> HookHandler
    HookHandler --> EventStore
```

Los nombres de los componentes internos son descriptivos y se deben contrastar con el código y el despliegue antes de tratarlos como nombres oficiales. Los diagramas muestran las responsabilidades observadas; no aseguran que la compra, el evento de usuario y el webhook compartan un `correlation-id`.

### Vista de recorrido resumida

El diagrama de abajo reúne los saltos con evidencia comunicada; no representa una traza única.

```mermaid
flowchart LR
    Cliente[Usuario / cliente]
    APIM[APIM\nGateway]
    BFF[Marketplace BFF]
    G7[G7 Seguridad]
    Broker[(RabbitMQ\nBroker)]
    Consumer[Consumidor de eventos]
    Ventas[Ventas]
    Webhook[Ventas\nWebhook]
    Despacho[Persistencia de despacho]

    Cliente -->|API de compra| APIM
    APIM --> BFF
    BFF -->|POST checkout y consultas| Ventas
    G7 -->|publica evento de usuario| Broker
    Broker -->|cola marketplace.usuarios| Consumer
    Ventas -->|eventos de despacho| Webhook
    Webhook -->|7 eventos persistidos| Despacho
```

> Confirmado: las pruebas informadas ejercitaron BFF→Ventas, G7→RabbitMQ (`marketplace.usuarios`) y Ventas→webhook de despacho. No se afirma que estos flujos correspondan a una misma traza distribuida. Confirmar el rol de Productos en el flujo de compra, el nombre del consumidor/webhook y los límites de confianza antes de congelar. El laboratorio RabbitMQ/PostgreSQL de Leonidas permanece separado y marcado LAB LOCAL.

## Enlaces de evidencia

| Componente / salto | Run / fuente | Reporte | Resultado / límite |
|---|---|---|---|
| Cuenta A → BFF | [Reporte REAL fusionado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/evidencias/H5/integracion-real/bff/2026-11-26/REAL-2026-11-26T21-00-23.847Z-7f8fc4c5.md) | [Índice de integración REAL](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real) | 19/19 OK, 0 fallos, sin 429; 26/11 16:00:23–16:00:32; alta de cuenta y rama MFA omitidas |
| BFF → Ventas (crear/leer pedido) | [Informe de compra REAL](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/evidencias/H5/integracion-real/compra/2026-11-26/REAL-2026-11-26T20-05-16.062Z-6afb7c7c.md); `requestId` en [trazabilidad](299-trazabilidad.md) | [Índice de integración REAL](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real) | Pedido creado/consultado y `PAGADO`; POST 202 y GETs 200; SHA BFF `f17896d`; cotización y revalidación son MOCK |
| G7 → RabbitMQ `marketplace.usuarios` | [BE #313](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/313) / [acuerdo A SPECS #22](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/22) | Outbox y lectura de evento `usuario.creado` v1 | Evento REAL cotejado con outbox; binding observado `usuario.*` |
| RabbitMQ → consumidor G7 / inbox | [BE #314, recuperación REAL](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314#issuecomment-7205557701); [BE #315](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/315) | Consulta PostgreSQL de solo lectura reportada | Se recuperaron manualmente tres eventos originales desde DLQ con parser candidato; no se probó una nueva entrega automática post-fix |
| Ventas → webhook de despacho | [BE #318](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/318) | Run/log primario pendiente | 7 eventos persistidos; 5 `DESPACHADO`, 2 `ENTREGADO`; token incorrecto 401 |
| Webhook/evento → correo C-002 | [BE #162](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/162) | Run/log primario pendiente | Reenvío de mismo eventId marcado duplicate; un correo enviado |
| LAB LOCAL RabbitMQ + PostgreSQL | `H5-evidencia-consumidor-Leonidas.md`; enlace exacto pendiente | Reporte lab; URL pendiente | RabbitMQ 4.1, PostgreSQL 16 desechables; eventos sintéticos, duplicado/reconexión y ensayo retry/DLQ; no es integración REAL |

## Datos para la vista C4

| Nivel | Artefacto | Enlace |
|---|---|---|
| Contexto | Actores y sistemas externos | Pendiente |
| Contenedores | APIM, BFF, servicios, RabbitMQ, consumidor y Ventas | Pendiente |
| Componentes | Configuración interna relevante para el flujo | Pendiente |

El diagrama y las filas anteriores avanzan el inventario de componentes; la evidencia todavía no contiene identificadores de despliegue/APIM, configuración desplegada, C4 validado por arquitectura ni una traza única que conecte los saltos.
