# Guía · Compra de homologación por el BFF (Ventas REAL)

La compra la pidió Brenis (G7). Ventas (G5) crea el pedido en su gateway, y el BFF desplegado de G1 (`https://g1-marketplace-backend.onrender.com`) orquesta la compra.

Con el modo de homologación, cada sistema queda así:
- **Ventas: REAL.**
- **G7: REAL** (token de la cuenta A y dirección).
- **Catálogo de checkout, cotización y revalidación: MOCK.** Salen del fixture `CHECKOUT_G5_TEST_FIXTURE`, y las cotizaciones llevan el prefijo `Q-G5-MOCK-`.

Diseño de referencia: `H5-G5-CHECKOUT-PREPARE.md`.

## Requisitos previos (todos, o no se ejecuta)
1. **Corte a `main` y deploy live** en Render con #366 (release 1.17.0 o posterior), en estado *Live*. **Nunca confirmar si el deploy no está live.** Anotar el SHA que muestra Render, porque `/health` no lo expone.
2. Variables en Render, cargadas por Diego:
   - `CHECKOUT_SALES_SOURCE=g5`
   - `G5_SALES_INTEGRATION_APPROVED=true`
   - `CHECKOUT_ADDRESS_SOURCE=g7`
   - `USE_MOCKS=false`
   - `CHECKOUT_G5_TEST_FIXTURE` vigente, con el `customerId` de la cuenta A, el SKU, el precio, el envío, el método de pago y su `expiresAt`.
3. **Ventana autorizada por Ventas y G7**, con fecha y hora, y el método de pago acordado con Ventas.
4. Cuenta A en G7 con MFA y acceso a su correo para el OTP, **con una dirección de prueba** y con el carrito vacío (o solo con el SKU aprobado ×1).
5. Valores esperados por escrito: SKU, precio unitario y envío en **céntimos**. Datos de contacto **sintéticos** aceptados por Ventas.

## Comandos
Desde la raíz del Backend, en la rama `feat/h5-kit-compra`:

```powershell
# 1) Ensayo seguro: llega a PREPARED y no crea pedido
pwsh -NoProfile -File scripts\compra-real.ps1 -HastaPreparacion
# 2) Compra: crea el pedido en Ventas tras escribir CREAR PEDIDO
pwsh -NoProfile -File scripts\compra-real.ps1
```

El script pide, por este orden:
1. `AUTORIZADO`.
2. `LIVE`.
3. El SHA live (opcional).
4. El correo de la cuenta A y su contraseña (oculta).
5. El SKU, el precio y el envío esperados.
6. La etiqueta de la dirección de prueba.
7. En la compra, el contacto sintético.
8. Durante la ejecución, el **OTP** (oculto) y, antes del paso 6, la frase **`CREAR PEDIDO`**.

La cotización caduca a los 5 minutos: hay que tener los datos a mano y confirmar sin pausas.

## Secuencia (verificada contra `develop` 1.17.0)

| Paso | Solicitud | Esperado | Etiqueta |
|---|---|---|---|
| G7 | `POST /auth/login` → `/auth/otp/solicitar` → `/auth/otp/verificar` | `accessToken` solo en memoria | G7 REAL |
| — | `GET /health` | 200 `UP` | BFF |
| 1 | `GET /api/v1/carts/current` (Bearer) | vacío, o el SKU ×1 (entonces se salta el 2) | BFF carrito |
| 2 | `POST /api/v1/carts/current/items` `{sku, quantity:1}` | **201 `ITEM_CREATED`**, un solo intento | BFF carrito |
| 3 | `GET /api/v1/checkout/delivery-addresses` | una dirección (o la etiqueta indicada) | G7 REAL vía BFF |
| 4 | `POST /api/v1/checkout/quotes` `{addressId, cartVersion}` | 200 y `quoteId` `Q-G5-MOCK-…`; SKU ×1, precio, envío y total iguales a lo esperado. Si no, **se detiene** | MOCK |
| 5 | `POST /api/v1/checkout/preparations` + `Idempotency-Key` A | **201**, `state=PREPARED`, `simulationConsent=RECORDED`, `revalidatedAt` | MOCK |
| 6 | `POST /api/v1/checkout/orders` + `Idempotency-Key` B, cuerpo `{checkoutOperationId, contact}` | 200 con `orderState`, o 202/429 | **Ventas REAL** |
| — | `GET /api/v1/checkout/operations/{id}` | estado de la operación y del pedido | Ventas REAL |
| G7 | `POST /auth/logout` | 204 | G7 REAL |

Diferencias con la secuencia original, según el código de `develop`:
- **La preparación responde 201**, no 200: el controlador no fija el código. Además, el BFF muestra `PREPARING` como `PREPARED`, así que el script exige también `simulationConsent=RECORDED` y `revalidatedAt`.
- **No se envía `paymentMethod`.** Con el fixture activo, el BFF toma el del fixture; uno distinto da 409 `SALES_ORDER_CONTEXT_INCOMPLETE`. Tampoco se envía `clienteId`: el BFF lo deriva del token.
- Las formas de respuesta difieren. `POST /orders` devuelve `data.orderId` y `data.orderState`, mientras que `GET /operations/{id}` devuelve `data.state` y `data.order.{orderId,state}`. Además, `GET /operations` responde **409 `ORDER_NOT_SUBMITTED`** si el envío no llegó a registrarse.
- **Las cookies del login de Marketplace sí bastarían.** `SessionMiddleware` convierte la cookie de sesión en `Bearer` para `/carts` y `/checkout`, y exige `Origin` en las mutaciones. El script usa el token de G7 directo, como se pidió, y nunca envía cookies.

## Reglas ante respuestas no finales
- **Un 200 no implica PAGADO.** El resultado solo es éxito si la operación está en `SUCCEEDED` y el pedido en `PAGADO`. Un 200 con `ANULADO` se informa como anulado.
- **202 o 429:** el script espera `Retry-After` (mínimo 5 s, máximo 120 s) y **consulta la operación**. Nunca reenvía el `POST` ni crea otra clave. Hace como máximo 4 consultas, y cada una puede tardar hasta 60 s porque el BFF sondea a Ventas cada 2,5 s.
- **Timeout del pedido:**
  - El script consulta la operación.
  - Si el BFF responde `ORDER_NOT_SUBMITTED`, reenvía **una vez** con la **misma clave B** y el mismo cuerpo.
  - Si no hay ID de pedido y el resultado es incierto, **se detiene** (exit 3): se concilia con Ventas usando la hora y los `X-Request-Id`.
- Ante cualquier respuesta inesperada se detiene. Siempre cierra la sesión de G7. Tope: 6 solicitudes a G7 y 20 al BFF.

**Códigos de salida:**
- 0: `PAGADO` (o ensayo preparado).
- 1: detenida antes del pedido.
- 2: pedido creado pero no `PAGADO` (pendiente o `ANULADO`).
- 3: incierto, sin ID de pedido.

## Informe
Se guarda en `docs/evidencias/H5/integracion-real/compra/<fecha>/` (ignorado por Git), en JSON y Markdown. Incluye:
- el SHA live si se informó;
- la hora de Lima, la ruta, el HTTP y el `X-Request-Id` de cada paso;
- el estado de la operación y del pedido;
- **solo el ID de pedido**, para pasarlo a Ventas;
- las etiquetas REAL/MOCK.

No incluye token, cookies, claves de idempotencia, IDs de operación, cotización o dirección, ni datos de contacto. Si detecta alguno, no escribe el informe.

## Verificación del script
- `npm run test:compra:kit`: 12 pruebas MOCK sin red. Cubren la secuencia feliz, el total distinto, 202, 429, el timeout con reenvío de la misma clave, el caso incierto, `ANULADO`, la confirmación, `--hasta-preparacion` y la ausencia de secretos en la salida.
- 26/11: ensayo `--hasta-preparacion` contra el BFF Nest real en localhost, con el fixture G5, PostgreSQL desechable y un doble local de G7. Llegó a PREPARED con la cotización `Q-G5-MOCK-` y el informe salió limpio. Es **MOCK**: no llamó a Ventas ni al G7 real, y el paso 6 solo está cubierto por las pruebas unitarias.
- Al cerrar la ventana: retirar `CHECKOUT_G5_TEST_FIXTURE` y desactivar Ventas en el checkout con un solo cambio de variables.
