# G-MAIL · Guía de C-001 y C-002 en Mailpit y Brevo

El comando local renderiza un pedido sintético con las plantillas F‑033. Envía C‑001 después de verificar `PAGADO` y C‑002 en `DESPACHADO`. El fixture `ENTREGADO` registra `skipped`. El [registro inicial de Mailpit](g-mail-mailpit-local.json) corresponde al alcance ensayado antes de acordar este cambio.

Este documento cubre la entrega de documentación de [BE #164](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/164). La revisión independiente y la evidencia del flujo integrado se registran con [BE #162](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/162), [FE #82](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/82) y [BE #163](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/163).

## Trazabilidad

| Alcance | Referencia | Implementación y evidencia |
| --- | --- | --- |
| F-033 · render server-side | [Spec funcional](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/funcional/F-033-generar-plantilla-correo.md), [contrato interno](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-033-generar-plantilla-correo.md) y [componentes React](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/componentes-react/F-033-generar-plantilla-correo.md) | [Render del snapshot](../../../src/notifications/email-template.ts) y [pruebas de render](../../../src/notifications/email-template.spec.ts). El PR expone funciones internas de TypeScript. El endpoint `POST /internal/v1/notifications/render` de la spec y la correspondencia con los componentes React quedan para revisión de contrato y [FE #81](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/81). |
| C-001 · Confirmación de compra | [Ficha visual C-001](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/ui/comunicaciones/C-001-correo-confirmacion-pedido.md) | Snapshot `ORDER_CONFIRMATION` con `PAGADO`. Diseño aprobado en [FE #156](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/156). |
| C-002 · Aviso de despacho | [Ficha visual C-002](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/ui/comunicaciones/C-002-correo-actualizacion-despacho.md) | Snapshot `SHIPMENT_UPDATE` con `DESPACHADO`. La fecha estimada se omite si no llega. El render contempla otros estados de la spec y el adaptador de entrega comercial filtra el envío a `DESPACHADO`. |
| G-MAIL · selección de transporte y ensayo | [Adaptador](../../../src/notifications/commercial-mail-transport.ts), [entrega](../../../src/notifications/commercial-mail-delivery.ts) y [runner de fixtures](../../../scripts/demo-commercial-mail.ts) | [Pruebas de entrega](../../../src/notifications/commercial-mail-delivery.spec.ts), [CI del PR #352](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/352/checks) y recibos de Brevo de esta guía. |

Las fichas visuales tienen el enlace de Figma marcado como pendiente. La referencia disponible para revisión visual es la [aprobación en FE #156](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/156#issuecomment-7122354433) y el [informe de Mailpit con 11 capturas](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/323#issuecomment-7122203279). El informe cubre escritorio, móvil, imágenes bloqueadas, preheader y texto plano. Los datos del informe son fixtures.

## Reproducción con Mailpit

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

El adaptador usa `POST https://api.brevo.com/v3/smtp/email` por HTTPS. El cuerpo contiene remitente, destinatario, asunto, HTML y texto plano. La clave se envía en la cabecera `api-key`. [API de Brevo](https://developers.brevo.com/reference/send-transac-email)

| Variable | Configuración |
| --- | --- |
| `MAIL_PROVIDER` | `brevo` para el ensayo con Brevo. `mailpit` para la alternativa local. |
| `BREVO_ENABLED` | El adaptador exige el valor exacto `true` para enviar. El ejemplo queda en `false`. |
| `BREVO_API_KEY` | Obligatoria y sin valor por defecto. Inyectar la clave de QA en el entorno local y la clave independiente del servicio desde Render. |
| `BREVO_SENDER_EMAIL` | Obligatoria y sin valor por defecto. Usar la dirección verificada en Brevo. |
| `MAIL_DEMO_TO` | Buzón QA autorizado. Solo lo usa el runner de fixtures. |
| `MAIL_TIMEOUT_MS` | Opcional. Entero de 100 a 30 000 ms. Por defecto, 3000 ms. |

En la copia del Backend, con las dependencias de desarrollo instaladas, cargar estas variables en el entorno e iniciar el ensayo. Si se usa un `.env` local ignorado por Git, Node puede cargarlo directamente. Usar solo una de estas dos formas por corrida:

```bash
# Variables ya cargadas en el entorno del proceso
npm run mail:demo

# O tomar las variables del .env local
node --env-file=.env -r ts-node/register scripts/demo-commercial-mail.ts
```

La salida registra ambiente, hora UTC, estado y resultado. En un envío aceptado incluye el HTTP observado y `messageId`. Comprobar recepción en el buzón QA y en spam. Para desactivar Brevo, aplicar `BREVO_ENABLED=false` al entorno efectivo del proceso. Con `MAIL_PROVIDER=brevo`, cualquier valor distinto de `true` se rechaza antes de emitir la solicitud.

### Brevo con datos de prueba, 26 de noviembre de 2026

La prueba local usó los mismos fixtures de pedido y despacho y un buzón QA. La API real de Brevo aceptó ambos envíos. Hora de recepción de la respuesta en Lima (UTC−05:00):

| Caso | Hora | HTTP observado | ID devuelto por Brevo |
| --- | --- | --- | --- |
| C-001, consulta `PAGADO` | 00:25:24.015 | 201 | `<202611260525.30344937202@smtp-relay.mailin.fr>` |
| C-002, aviso `DESPACHADO` | 00:25:24.814 | 201 | `<202611260525.22205990788@smtp-relay.mailin.fr>` |

`ENTREGADO` se omitió. La primera corrida del día (00:11) obtuvo los IDs `<202611260511.31953027233@smtp-relay.mailin.fr>` y `<202611260511.18107084015@smtp-relay.mailin.fr>`. El script de esa corrida solo capturaba que la respuesta era 2xx. La prueba confirma la aceptación por el proveedor. Queda la verificación de recepción en el buzón y la integración de los disparadores en el despliegue.

## Diagnóstico y recuperación

| Resultado | Qué revisar |
| --- | --- |
| `BREVO_DISABLED` | El interruptor está apagado o no contiene `true`. En una prueba de apagado, este es el resultado esperado. |
| `BREVO_API_KEY_REQUIRED`, `BREVO_SENDER_REQUIRED`, `BREVO_RECIPIENT_INVALID` | Confirmar la presencia de la variable de entorno, la dirección verificada y el buzón QA. Mantener valores y destinatarios fuera de logs y evidencias compartidas. |
| `MAIL_TIMEOUT_INVALID` | Confirmar el rango de `MAIL_TIMEOUT_MS`. |
| `BREVO_HTTP_401` o `BREVO_HTTP_403` | Revisar la clave del entorno y las restricciones de la cuenta que aplica Brevo. El 401 por IP del ensayo anterior quedó superado para la prueba local del 26/11. |
| `BREVO_HTTP_429` o `BREVO_HTTP_5xx` | Registrar hora y estado, y revisar la cuota o disponibilidad del proveedor. El adaptador realiza un solo intento. |
| `BREVO_TIMEOUT`, `BREVO_UNAVAILABLE` o `BREVO_INVALID_RESPONSE` | La aceptación puede ser incierta. Correlacionar con el registro de Brevo antes de repetir para evitar duplicados. |
| HTTP 201 y `messageId` | Brevo aceptó la solicitud. Registrar si se recibió el mensaje y revisar su contenido en el buzón. |

Los errores HTTP y el timeout tienen pruebas con dobles. La aceptación HTTP 201 de la tabla anterior se observó contra Brevo con fixtures locales. La CI y los resultados del 26/11 corresponden al código de prueba publicado en [`fd87942`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/fd87942ffab31acd54770d94bd71684fad37685e).

## Señales y deduplicación para la integración

| Correo | Señal acordada | Datos para el render | Identidad de entrega propuesta |
| --- | --- | --- | --- |
| C-001 | La consulta de detalle de Ventas confirma `PAGADO` para el mismo pedido. | `orderId`, momento acreditado para la confirmación, total de la orden en PEN y líneas cuando estén disponibles en el snapshot autorizado. | Tipo de aviso y `orderId`, de forma que consultar de nuevo el mismo pedido no dispare un segundo correo. Leo debe confirmar la ruta o método, el contrato y el origen de la fecha. |
| C-002 | Webhook H-05 de Ventas con `data.publicStatus=DESPACHADO`. | `data.orderId`, `timestamp` del evento y `data.estimatedDeliveryDate` cuando esté disponible. El renderer recibe el tipo `SHIPMENT_UPDATE` y el estado `DESPACHADO`. | Tipo de aviso y `eventId`. El [inbox de #357](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/357) persiste el evento. [BE #365](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/365) añade `shipment_mail_notice` con referencia única por evento. [BE #381](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/381) añade el procesamiento de un pedido QA acordado. |

El C-002 desplegado para QA usa el buzón configurado para ese ensayo. La fuente autorizada del destinatario comercial queda pendiente, porque el DTO de detalle actual de Ventas carece de correo.

## Checklist integrado de C-002 en Render

Ensayo del 26 de noviembre de 2026 con el pedido sintético `PED-2026-90001`. Ambos intentos reutilizaron el `eventId` `c53403f0-a940-44d6-a3f1-4652d301e99a`.

| Hora de Lima | Acción | Resultado observado |
| --- | --- | --- |
| 17:07:59 | Ventas envió `DESPACHADO`. | Evento inicial del ensayo QA. |
| 17:08:37 | El worker procesó el aviso en Render. | Estado `sent`, Brevo HTTP 201 y recepción en el buzón QA. |
| 17:09:12 | Ventas reenvió el mismo `eventId`. | El buzón conservó un correo total y los logs mostraron un solo registro de envío para ese evento. |

- [x] Señal integrada `DESPACHADO` recibida y procesada en Render.
- [x] Recepción de un C-002 en el buzón QA.
- [x] Reenvío del mismo evento con un único correo observable.
- [x] HTML y texto plano comprobados por separado con fixtures en Mailpit.

[Registro del ensayo integrado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/162#issuecomment-7204545580) · [Evidencia de Mailpit](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/323#issuecomment-7122203279)

## Evidencia que falta del despliegue

- Acordar la fuente autorizada del destinatario comercial.
- Acreditar C-001 en `PAGADO` y ausencia de duplicados en una operación QA de staging. El trabajo de C-001 conserva su [PR #395](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/395).
- Cubrir la omisión de `ENTREGADO`, fallo y timeout en el entorno acordado. Los resultados de fixtures se conservan en las secciones anteriores.
- Registrar URL y SHA o digest del despliegue, origen de cada señal, hora y resultado, recibo de Brevo y comprobación del buzón. La revisión independiente de esta documentación corresponde a Sebastián. El cierre integral conserva el resultado de BE #162, FE #82 y BE #163.
