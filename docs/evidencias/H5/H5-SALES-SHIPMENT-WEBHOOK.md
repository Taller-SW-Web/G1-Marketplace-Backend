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

## Proyección y reproceso — pendiente (#319)

El inbox es el registro durable de entrada; no se proyecta todavía el estado a seguimiento F-032 ni se dispara el correo F-035. La proyección/reprocesador queda en #319, leyendo este inbox; no se asigna aquí responsable ni fecha que no estén confirmados. El correo continúa condicionado a G-MAIL.

Hasta que exista ese consumidor, no borrar ni editar filas del inbox. Para revisar y preparar un replay se ordenan todas las filas por `received_at, event_id`:

```sql
SELECT event_id, order_id, payload, received_at
FROM shipment_event_inbox
ORDER BY received_at ASC, event_id ASC;
```

La tabla aún no tiene marca/checkpoint de procesamiento. El consumidor de #319 debe añadir un checkpoint/outbox de proyección y hacer idempotentes F-032 y F-035 por `eventId`; así podrá reintentar fallos y reproducir desde el inicio sin pedir a Ventas que reenvíe eventos ni duplicar efectos. No hay hoy un comando de reproceso ejecutable ni se afirma que el seguimiento/correo ya estén actualizados.

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
