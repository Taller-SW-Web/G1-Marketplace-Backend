# Integración REAL · evidencia del 26/11/2026

Índice de los informes sanitizados de la compra con Ventas y de la ronda por el BFF con Seguridad. Las horas son de Lima (UTC-5). Ningún informe incluye tokens, claves de idempotencia, IDs de operación, datos de contacto ni cuerpos de respuesta.

## Compra REAL con Ventas (BE #380, #397, #387)

Pedido **PED-2026-00092**: `PROD-101`, 139,90 PEN (129,90 + envío 10,00), tarjeta de crédito, entrega a domicilio. Ventas lo confirmó en su base (canal MARKETPLACE) y lo pasó a **PAGADO** a las 15:17:04.

| Informe | Hora de inicio | Resultado | Qué muestra |
| --- | --- | --- | --- |
| [`13c5ba75`](./compra/2026-11-26/REAL-2026-11-26T19-10-41.028Z-13c5ba75.md) | 14:10 | INCIERTO | Primer intento: Ventas respondió 429 por arranque en frío y no hubo ID de pedido. |
| [`b22ef8d1`](./compra/2026-11-26/REAL-2026-11-26T19-21-07.825Z-b22ef8d1.md) | 14:21 | INCIERTO | HTTP 409 `ORDER_CREATION_PENDING`: el BFF cortó a los 5 s y Ventas tardó unos 5,8 s. Se corrigió con BE #397 (tiempos propios) y BE #387 (restricción de la tabla). |
| [`4c9758e6`](./compra/2026-11-26/REAL-2026-11-26T19-57-22.084Z-4c9758e6.md) | 14:57 | PREPARADA_SIN_PEDIDO | Con `f17896d` desplegado: flujo hasta la preparación, sin crear pedido. |
| [`6afb7c7c`](./compra/2026-11-26/REAL-2026-11-26T20-05-16.062Z-6afb7c7c.md) | 15:05 | PEDIDO_SIN_CONFIRMAR | `POST /checkout/orders` → **202** a las 15:06:11, pedido `PED-2026-00092` en CREADO. |

El informe `6afb7c7c` dice «PEDIDO_SIN_CONFIRMAR» porque el script dejó de consultar antes de que Ventas pasara el pedido a PAGADO. No es una contradicción: el **PAGADO se verificó después por lectura** con la cuenta A:

| Hora | Ruta | HTTP | requestId | Estado |
| --- | --- | ---: | --- | --- |
| 15:26 | `GET /api/v1/orders/me` | 200 | `d1750523-fd6b-43f6-b8ac-e9e64a55ee9f` | lista el pedido en PAGADO |
| 15:26 | `GET /api/v1/orders/PED-2026-00092` | 200 | `103f155a-6040-4fa9-89de-f7f39fa7ab1e` | PAGADO |
| 15:46:09 | `POST /api/v1/checkout/orders` (misma clave y operación) | 202 | `132ea7e8-9bdc-46ca-af2a-c0a96a6d2c57` | mismo pedido, sin duplicado |

Etiquetas: **Ventas REAL**, **G7 REAL** (token y dirección). **La cotización y la revalidación son MOCK** (fixture `Q-G5-MOCK-`), porque Ventas no expone cotización.

Pendiente a esta hora: `DESPACHADO` y `ENTREGADO` reales del pedido, la lectura con la cuenta B (aislamiento, esperado 403) y el CSAT.

## Ronda por el BFF con Seguridad

[`7f8fc4c5`](./bff/2026-11-26/REAL-2026-11-26T21-00-23.847Z-7f8fc4c5.md): 16:00:23–16:00:32, 19 de 19 casos aprobados, 0 fallos y sin 429, con la autorización de G7 para esa ventana. Se omitieron el registro de una cuenta nueva y la rama con MFA.

## Ronda 3 por el BFF con Seguridad (26/11/2026, 20:20:27–20:21:03 Lima)

[`bd39d232`](./bff/2026-11-27/REAL-2026-11-27T01-20-27.576Z-bd39d232.md): 24 de 30 solicitudes autorizadas por G7, 0 fallos, sin 429, BFF `f17896d` con el origen de Vercel. Cubre registro nuevo (201, pendiente de verificación y sin sesión), correo ya registrado (409 neutro), contraseña incorrecta (401), login sin MFA, **login con MFA** (desafío 200, OTP por correo 200, sesión solo tras verificar el OTP), logout, cookie anterior (refresh 401), direcciones propias (200, 201 y titular ajeno 400) y recuperación neutra (202 y 202).

## Aislamiento entre cuentas A y B (19:33–19:34 Lima)

Con la cuenta B (MFA por correo) por el BFF: `GET /orders/me` → 200 con 0 pedidos y sin `PED-2026-00092` (`af00be48-285e-4d30-9910-2ba235eb8d5c`); `GET /orders/PED-2026-00092` → **403** (`84fc5c34-cedf-4d73-8962-4dbb0c4996ff`). Solo lectura.

## Límites

- Cuentas de prueba de G7; no hay usuarios reales.
- La compra usa un fixture de cotización (MOCK).
- Esta evidencia no cubre carga ni producción real; los informes de performance viven en `docs/evidencias/H5/performance/`.
