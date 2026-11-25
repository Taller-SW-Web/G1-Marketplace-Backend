# G-MAIL · C-001 y C-002 en Mailpit

El comando local renderiza un pedido sintético con las plantillas F‑033. Envía C‑001 después de verificar `PAGADO` y C‑002 en `DESPACHADO`. El fixture `ENTREGADO` registra `skipped`. El [registro inicial de Mailpit](g-mail-mailpit-local.json) corresponde al alcance ensayado antes de acordar este cambio.

## Reproducción

Arrancar Mailpit con la interfaz y API en loopback. El envío usa `POST /api/v1/send` de la API HTTP de Mailpit.

```bash
docker run --rm --name marketplace-mailpit -p 127.0.0.1:8025:8025 axllent/mailpit:v1.34.0
```

También se puede usar el binario oficial: `mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025`.

En Backend, con las dependencias del proyecto instaladas:

```bash
MAIL_PROVIDER=mailpit MAILPIT_BASE_URL=http://127.0.0.1:8025 npm run mail:demo
npm run test:unit -- --runTestsByPath src/notifications/email-template.spec.ts src/notifications/commercial-mail-delivery.spec.ts
```

El script imprime identificadores de captura para los dos envíos y el resultado de los tres casos. Abrir el buzón en `http://127.0.0.1:8025` y revisar las partes HTML y texto plano de cada mensaje. Se puede consultar cada mensaje con `GET /api/v1/message/{ID}`.

| Variable | Uso en el ensayo |
| --- | --- |
| `MAIL_PROVIDER` | Selección explícita de `mailpit` |
| `MAILPIT_BASE_URL` | Origen HTTP de loopback. Por defecto `http://127.0.0.1:8025` |
| `MAIL_FROM` | Remitente de prueba. Por defecto `marketplace@example.invalid` |
| `MAIL_DEMO_TO` | Destinatario de prueba. Por defecto `qa-marketplace@example.invalid` |
| `MAIL_TIMEOUT_MS` | Espera máxima de la solicitud, por defecto 3000 ms |

El transporte local limita las direcciones a `.invalid` y requiere un entorno distinto de producción. Una falla o un timeout se reportan al operador. Mailpit puede haber aceptado el mensaje antes de una pérdida de respuesta, por lo que el script evita reenvíos automáticos.

Las pruebas simulan la consulta del detalle de Ventas y el sobre de H‑05. Cubren respuestas `CREADO` y `ANULADO`, lectura de otro pedido, consultas concurrentes del mismo `PAGADO`, repetición del mismo `eventId` de `DESPACHADO` y omisión de `ENTREGADO`. La deduplicación del ensayo vive en memoria por ejecución.

## Ensayo de entrega con Brevo

El proveedor se selecciona con `MAIL_PROVIDER=brevo`. Usa `POST https://api.brevo.com/v3/smtp/email` por HTTPS y transmite el asunto, el HTML y el texto de la plantilla al comprador indicado. [API de Brevo](https://developers.brevo.com/reference/send-transac-email)

Brevo requiere `BREVO_SENDER_EMAIL` con el remitente verificado y `BREVO_API_KEY` inyectada en el entorno. Usar la clave local de QA para el ensayo y una clave independiente como secreto del servicio en Render. Para ensayar con los fixtures, configurar además `MAIL_DEMO_TO` con el buzón QA autorizado y ejecutar `npm run mail:demo` desde un entorno con las dependencias de desarrollo y esas variables inyectadas. El script reporta la aceptación y el identificador del mensaje. La recepción se verifica en el buzón acordado. [Verificación de remitente](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)

## Integración pendiente

La señal de C‑001 es la consulta del detalle de Ventas que confirma `PAGADO` para el mismo pedido. El DTO de detalle actual no trae correo del comprador. Ambos flujos requieren resolver el destinatario autorizado y registrar de forma duradera la entrega mediante `NotificationDelivery`. C‑002 depende de proyectar el inbox H‑05 para obtener la actualización `DESPACHADO`. La prueba en el buzón real queda pendiente de autorizar en Brevo la IP de la prueba local. [Inbox H‑05](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/357) · [Proyección #319](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/319) · [BE #162](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/162)
