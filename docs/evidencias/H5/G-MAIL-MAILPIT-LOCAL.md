# G-MAIL · C-001 y C-002 en Mailpit

El comando local renderiza un pedido de prueba con las plantillas F‑033 y captura tres mensajes en un buzón Mailpit. Los casos son confirmación C‑001 con `PAGADO` y actualización C‑002 en `DESPACHADO` y `ENTREGADO`.

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

El script imprime identificadores de captura y estados. Abrir el buzón en `http://127.0.0.1:8025` y revisar las partes HTML y texto plano de cada mensaje. Se puede consultar cada mensaje con `GET /api/v1/message/{ID}`.

| Variable | Uso en el ensayo |
| --- | --- |
| `MAIL_PROVIDER` | Selección explícita de `mailpit` |
| `MAILPIT_BASE_URL` | Origen HTTP de loopback. Por defecto `http://127.0.0.1:8025` |
| `MAIL_FROM` | Remitente de prueba. Por defecto `marketplace@example.invalid` |
| `MAIL_DEMO_TO` | Destinatario de prueba. Por defecto `qa-marketplace@example.invalid` |
| `MAIL_TIMEOUT_MS` | Espera máxima de la solicitud, por defecto 3000 ms |

El transporte local limita las direcciones a `.invalid` y requiere un entorno distinto de producción. Una falla o un timeout se reportan al operador. Mailpit puede haber aceptado el mensaje antes de una pérdida de respuesta, por lo que el script evita reenvíos automáticos.

## Integración pendiente

El ensayo usa snapshots sintéticos. Para C‑001, el integrador debe obtener de Ventas un snapshot autorizado del mismo pedido y verificar `PAGADO`. Para C‑002, el consumidor del evento aceptado por [BE PR #357](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/357) debe pasar el estado público y la fecha del evento al servicio de entrega. La deduplicación de la entrega y el transporte real dependen del punto de integración acordado con Ventas y Seguridad. Verificar ambos mensajes en el buzón acordado antes de acreditar [BE #162](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/162).
