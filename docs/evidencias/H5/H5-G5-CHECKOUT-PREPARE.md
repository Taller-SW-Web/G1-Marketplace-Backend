# H5 — Preparación local de Checkout con G5

## Alcance y seguridad

- [#366](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/366) apunta a `develop`, después de integrar [#344](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/344).
- El contrato `specs/api-contract.md` es índice; para M1 se usó `specs/api/api-ventas.md` y el OpenAPI local fijado 1.10.0.
- No se llamó a G5, G7 ni Render. No hay credenciales ni respuestas reales en este branch.
- Valores seguros por defecto: `CHECKOUT_SALES_SOURCE=mock`, `G5_SALES_INTEGRATION_APPROVED=false` y `G5_CONTRACT_PRODUCT_FALLBACK_ENABLED=false`.
- Render declara `G7_SERVICE_CLIENT_ID` y `G7_SERVICE_CLIENT_SECRET` como `sync:false`; Diego debe introducirlos únicamente en el panel privado. No se solicita ni registra su valor.

## Flujo implementado y probado offline

- `G7SalesTokenProvider` pide `client_credentials` en `POST /api/v1/auth/token` enviando únicamente `grant_type`, `client_id` y `client_secret`; no envía `scope` ni `audience`. Verifica la respuesta Bearer, el grant `ventas:pedidos:crear` y los claims `aud=api-ventas`/scope antes de usar el token. Cachea y renueva el token; la conexión queda detrás de los flags de G5.
- `G5SalesProvider` usa ese token de servicio solo para `POST /api/v1/pedidos`, con `canal=MARKETPLACE`, `contacto.clienteId` derivado del `sub` autenticado y la misma clave UUID v4 de `Idempotency-Key`. No inventa un endpoint de búsqueda por clave.
- `GET /api/v1/pedidos/me` y `GET /api/v1/pedidos/{pedidoId}` reenvían el bearer del comprador. G1 expone `GET /api/v1/orders/:orderId` con una proyección sin PII; la autorización de titularidad sigue en G5, y un `403` se conserva.
- Después de que el POST devuelve un pedido, G1 persiste su ID externo antes de consultar el detalle. Los reintentos usan la misma clave y las lecturas de estado usan el JWT del cliente. El cuerpo se reconstruye, incluida una nueva lectura de la dirección G7: falta demostrar que el reintento tras un timeout conserva el mismo payload si la dirección cambió.
- El sondeo G5 de checkout consulta cada 2.5 s como máximo por 60 s, termina solo al observar `PAGADO` o `ANULADO`, y respeta `Retry-After` sin exceder ese presupuesto. `/me` y el BFF de detalle esperan y reintentan una vez ante `429`; si no pueden reintentar dentro de 60 s, devuelven `429` con `Retry-After` cuando el gateway lo informa.
- El snapshot durable de la cotización conserva montos y metadatos de producto sin persistir contacto ni dirección; la migración aditiva es `prisma/migrations/20261125000200_checkout_quote_snapshot/migration.sql`.

## Homologación acotada: Ventas REAL / catálogo de checkout, cotización e inventario MOCK

- En el servicio de prueba, mantener `USE_MOCKS=false`, `AUTH_ENABLED=true`, `CHECKOUT_ADDRESS_SOURCE=g7` y `G5_CONTRACT_PRODUCT_FALLBACK_ENABLED=false`. `CHECKOUT_SALES_SOURCE=g5` y `G5_SALES_INTEGRATION_APPROVED=true` habilitan Ventas con G7; no habilitan mocks globales.
- `CHECKOUT_G5_TEST_FIXTURE` (vacío por defecto) es un JSON privado de la ventana acordada. Campos: `customerId` (UUID v4 del `sub` G7), `sku`, `productId`, `unitPriceCents` (>0), `shippingCents` (>=0), `paymentMethod` y `expiresAt` (UTC ISO con milisegundos, p. ej. `YYYY-MM-DDTHH:mm:ss.sssZ`). Cargar directamente en Render; no guardar valores de la cuenta ni credenciales en la PR.
- Con el fixture activo, solo esa cuenta puede preparar y enviar el SKU acordado, en cantidad uno, sin cupón y con el método de pago aprobado. El precio, el envío y el ID de producto salen del fixture aprobado, no del navegador. El catálogo de checkout, cotización y revalidación son locales (MOCK); autenticación/dirección G7 y creación/lectura del pedido G5 usan sus adaptadores reales. No se cambia el catálogo público ni se habilitan los demás mocks.
- Usar un carrito con ese único SKU y una dirección de prueba. Las cotizaciones `Q-G5-MOCK-…` caducan a los 5 minutos o al terminar la ventana, lo que ocurra primero. Se rechaza un pedido nuevo si el fixture no coincide con la cotización, si se retira o si caduca.
- Para la evidencia registrar SHA activo, hora, ID de correlación/pedido autorizado y estados observados sin PII. Etiquetar por separado **G7/Ventas REAL** y **catálogo de checkout/cotización/revalidación MOCK**. El CI usa dobles y no es evidencia REAL. Al finalizar, retirar `CHECKOUT_G5_TEST_FIXTURE` y cerrar la activación de Ventas del checkout en un mismo cambio de variables; no borrar los secretos compartidos de G7.

## Bloqueos antes de un pedido real

- Fuera del fixture acotado, el flujo G1 de cotización/revalidación todavía depende de `catalog.mock`/`inventory.mock`; con `USE_MOCKS=false` falla cerrado. La prueba no cierra su integración real.
- Las líneas actuales no traen necesariamente `productoId` y precio unitario confiables. Si faltan, Checkout no reclama ni envía el pedido. El fallback del contrato solo se permite con flag explícito, una línea `SKU-AUR-01`, cantidad 1 y subtotal exacto 129.90; todavía exige una cotización válida y costos reconciliados.
- Checkout requiere `paymentMethod` para G5. La modalidad `DOMICILIO`, el costo y la dirección se derivan del flujo de cotización y de la dirección G7 seleccionada; el destinatario usa `deliveryRecipient` o el nombre de contacto. El DTO actual de contacto pide nombre, tipo/número de documento, teléfono y email. No se inventa ninguno de estos datos.
- Para la homologación, Seguridad debe confirmar el grant `ventas:pedidos:crear` con audiencia `api-ventas`, la identidad de la cuenta A y una dirección de prueba. Ventas debe confirmar el entorno autorizado, un producto/precio, el método de pago aceptado y cómo llegará el pedido a `PAGADO`. El equipo debe confirmar cómo enviará el cliente `paymentMethod` en el checkout.
- No se implementa aquí el envío productivo de C-001 ni su deduplicación durable. El sondeo permite observar `PAGADO`, pero el correo sigue bloqueado hasta integrar transporte de producción e idempotencia.
- La prueba live A/B, el reenvío idempotente y cualquier creación de pedido siguen pendientes de datos de prueba, variables en Render, revisión de este branch y autorización/ventana explícitas. No desplegar ni activar `CHECKOUT_SALES_SOURCE=g5` con este documento como única evidencia.

## Verificación offline

- `npx jest --runInBand --runTestsByPath src/checkout/external/g5-sales.provider.spec.ts src/checkout/external/g7-sales-token.provider.spec.ts src/checkout/external/mock-http.adapter.spec.ts src/orders/providers/g5-orders.provider.spec.ts src/config/environment.spec.ts`
- `npx jest --runInBand --runTestsByPath src/checkout/checkout.service.spec.ts`
- `npm run typecheck` y `npm run build`.
- `npx jest --runInBand --config ./test/jest-e2e.json --runTestsByPath test/orders.e2e-spec.ts`.
- Los tests usan únicamente tokens sintéticos y dobles/local loopback; no demuestran disponibilidad ni autorización real de G5/G7.
