# H5 — receptor del webhook de envíos de Ventas

## Contrato y autenticación

- Ruta: `POST /api/v1/webhooks/ventas/envios`.
- Evento: `ShipmentStatusUpdated`, versión `1.0.0`, emisor exacto `modulo-ventas`.
- Ventas autentica con `X-Webhook-Token`. El código y `render.yaml` fijan `VENTAS_WEBHOOK_HEADER=x-webhook-token` por defecto. `VENTAS_WEBHOOK_TOKEN` es obligatorio y se configura únicamente en el gestor privado de secretos de Render; no se guarda en Git ni se solicita para esta prueba. Si no está configurado, el endpoint responde 503.
- El sobre requiere `eventId` UUID, timestamp ISO real, `data.orderId` con forma `PED-YYYY-NNNNN`, `data.publicStatus`, `data.trackingNumber` y `data.estimatedDeliveryDate`. La fecha estimada debe estar presente, acepta `null` y si es una fecha debe ser real (`YYYY-MM-DD`).
- Se aceptan y persisten estados `publicStatus` no conocidos, con 200. Se reserva 400 para un sobre mal formado; no se consulta el pedido ni se rechaza por no existir en el backend.
- El token se compara en tiempo constante. No se registran tokens ni payloads en las respuestas de error.

## Identificador upstream informado por Despacho — mapeo pendiente (#318)

- El 25/nov/2026, Despacho confirmó que al iniciar un traslado envía a Ventas `DESPACHO_EN_CAMINO` con `idEvento`, y reportó que G2 ya transmite el ID original a Ventas. La referencia del flujo G2→Ventas debe quedar en G2 Specs PR #42.
- Esta respuesta sólo confirma el tramo Despacho→Ventas. No acredita qué identificador incluye Ventas en el webhook `pedidos.envio.estado_actualizado` hacia Marketplace ni que `idEvento` sea el `eventId` del contrato H-05.
- El receptor G1 de esta PR valida y deduplica por el `eventId` exigido por H-05. No se aliasa `idEvento` a `eventId` ni se transforma el evento G2 directamente; un sobre que no cumpla el contrato de Ventas se rechaza.
- Pendiente entre Ventas y Marketplace (#318): confirmar por escrito si Ventas propaga el ID original como `eventId` o en un campo de correlación separado. No cambiar el parser ni el esquema de persistencia hasta cerrar ese acuerdo.

## ACK, persistencia y deduplicación

- La migración aditiva `20261124000100_shipment_event_inbox` crea `shipment_event_inbox`; su PK única es `event_id` y conserva `order_id`, el payload JSON completo y `received_at`.
- El endpoint responde 200 únicamente después de insertar el evento. Reintentos con el mismo UUID responden 200 con `duplicate=true` y no crean otra fila. Un fallo de escritura responde 503, para que Ventas pueda reintentar.
- Un pedido desconocido sigue siendo persistido y recibe 200; la bandeja no depende de una fila de pedido ni de la disponibilidad de módulos posteriores.

## Proyección y aviso pendiente de envío (#319)

El endpoint `GET /api/v1/orders/{orderId}/tracking` reutiliza la consulta de #366 con el bearer del comprador. G5 debe autorizar el pedido antes de consultar el inbox. Luego se construye el seguimiento con el estado del resumen y los eventos `DESPACHADO` y `ENTREGADO` del inbox. Los errores 403 y 404 se devuelven sin datos de seguimiento. Mientras el pedido aún no tenga seguimiento, devuelve 202.

La migración `20261126000100_shipment_mail_notice` encola C-002 al guardar un `DESPACHADO`, incluso si nadie consulta el seguimiento. También agrega los `DESPACHADO` que ya existían en el inbox. Una fila por `event_id` referencia al evento original y queda pendiente mientras `sent_at` sea nulo. La cola guarda la referencia al evento, sin destinatario. El consumidor de correo debe resolver el destinatario a partir de una fuente autorizada, enviar por el transporte de #352 y registrar el envío confirmado. Encolar C-002 todavía no acredita entrega de correo.

Para comprobar si un evento se encoló, consultar `shipment_mail_notice` por `event_id`. La proyección siempre se reconstruye al consultar el pedido y el inbox conserva el evento original.

No habilitar los siete eventos de Ventas hasta tener aprobación de Diego/Andrés, despliegue autorizado en staging y una prueba 2xx con la cabecera acordada. La activación corresponde a Ventas después de esa evidencia.

## Pruebas

Unitarias/HTTP en memoria (sin servicios externos):

```text
npx jest --runInBand --runTestsByPath src/webhooks/ventas/shipment-webhook.spec.ts src/webhooks/ventas/prisma-shipment-event.sink.spec.ts
```

Integración con PostgreSQL 16 desechable, que aplica todas las migraciones antes de levantar el endpoint de prueba:

```powershell
docker compose -f docker-compose.h5-webhook-test.yml up -d --wait
$env:TEST_DATABASE_URL = "postgresql://h5_test:h5_local_test_only@127.0.0.1:55433/marketplace_h5_webhook_test?schema=public"
npm run test:ventas:webhook:postgres
Remove-Item Env:TEST_DATABASE_URL
docker compose -f docker-compose.h5-webhook-test.yml down
```

El script rechaza cualquier host que no sea loopback y cualquier base cuyo nombre no sea exactamente `marketplace_h5_webhook_test`; no usarlo con una base compartida. La integración comprueba migración aplicada, duplicado 200/una fila, pedido desconocido persistido con 200 y 503/no fila ante fallo de escritura. El job de CI [45553497971](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45553497971) pasó esos tres casos sobre PostgreSQL 16 efímero. La ejecución local queda pendiente: Docker Desktop no estaba activo en este entorno.

Refs: #319

## Prueba coordinada de C-002 con Brevo

El consumidor QA lee `shipment_mail_notice` en intervalos de cinco segundos. Recupera el `DESPACHADO` del inbox y renderiza el correo con el enlace al seguimiento. Solo toma avisos del pedido configurado cuyo evento se recibió a partir del corte UTC. La migración `20261126000200_claim_shipment_mail_notice` agrega las columnas necesarias para registrar el intento y el recibo.

| Variable | Preparación en staging |
| --- | --- |
| `C002_QA_ENABLED` | `false` por defecto. Activar con `true` solo para el ensayo acordado. |
| `BREVO_ENABLED` y `MAIL_PROVIDER` | Requiere `true` y `brevo`, respectivamente. |
| `C002_QA_ORDER_ID` | Identificador exacto del pedido sintético de la cuenta QA que confirme Jim. |
| `C002_QA_TO` | Dirección del buzón QA acordado, desde el entorno del servicio. |
| `C002_QA_EVENT_AFTER` | Instante UTC ISO 8601 acordado antes de disparar el envío, por ejemplo `2026-11-26T12:00:00Z`. Los avisos históricos recibidos antes del corte quedan fuera del ensayo. |
| `G1_WEB_ORIGIN` | Origen HTTPS exacto de la web de staging para el enlace a «Mis pedidos». |
| `BREVO_API_KEY` y `BREVO_SENDER_EMAIL` | Clave de Brevo del servicio y remitente verificado, según la [guía de Brevo](G-MAIL-MAILPIT-LOCAL.md). |

1. Confirmar el corte desplegado, las migraciones, el pedido sintético y el buzón. Configurar staging y enviar un `DESPACHADO` de ese pedido.
2. Abrir «Mis pedidos» con la cuenta QA y comprobar el seguimiento. Verificar recepción de C-002 y el enlace del correo.
3. Correlacionar el `eventId` con `shipment_mail_notice`. Después de la aceptación deben quedar `sent_at` y `provider_message_id`. Repetir el evento con el mismo ID y confirmar que queda una fila y un correo.
4. Volver a `C002_QA_ENABLED=false` y `BREVO_ENABLED=false` al terminar. Registrar fecha, SHA de staging, ID del evento, resultado de Brevo y recepción, sin incluir la dirección QA ni credenciales.

El consumidor reserva de forma atómica el ID en `attempted_at` antes de enviar. Solo guarda `sent_at` y el recibo cuando el adaptador devuelve una aceptación. Si hay timeout, caída del proceso o error al guardar el recibo, una fila con `attempted_at` y sin `sent_at` indica un intento pendiente de reconciliar. Revisar el registro de Brevo antes de considerar otro intento. La prueba de PostgreSQL usa una respuesta de proveedor simulada para comprobar concurrencia, reentrega, corte, alcance del pedido y persistencia. La recepción real queda para el ensayo coordinado.
