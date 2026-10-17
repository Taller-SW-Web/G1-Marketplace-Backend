# Contrato local H3 — favoritos — v0.2.0

Vigente: F-036/F-038 compatibles, lectura F-037 y adición al carrito conservando el
favorito por decisión explícita del usuario. Ver [handoff actualizado](../FAVORITOS-FRONTEND-HANDOFF.md)
y [OpenAPI](openapi-h3.json). La propuesta original de mover/eliminar F-039 no se declara cumplida.

Precisión local de las specs vigentes, registrada antes de implementar. Estado: decisión de implementación del plan autorizado por Diego; revisión independiente y homologación externa pendientes. No modifica contratos de Seguridad/Productos ni libera gates. Propuesta de traslado a SPECS para revisión del equipo.

POST `/api/v1/wishlist/items`, Bearer JWT, cuerpo estricto `{"productId":"PRD-1"}`: 201 creado/200 existente, respuesta `{"productId":"PRD-1"}`. DELETE `/api/v1/wishlist/items/{productId}`: 204 sin cuerpo, incluyendo registro propio ausente. Identidad exclusivamente del token; no se admite `customerId` de entrada.

`productId`: string entre 1 y 100 caracteres Unicode, sin espacios exteriores ni controles U+0000–001F/U+007F–009F. Conservar el identificador sin transformaciones. Favorito por producto, no SKU. DELETE no consulta catálogo.

Errores `{code,message}`: 400 INVALID_REQUEST (JSON/cuerpo/campos adicionales), 400 INVALID_PRODUCT_ID, 401 UNAUTHORIZED, 404 PRODUCT_NOT_AVAILABLE, 503 CATALOG_UNAVAILABLE, 500 INTERNAL_ERROR. Health (`/`, `/health`, `/ready`): 200 con `status: "UP"` o 503 con `status: "DOWN"`; conserva `service`, `environment`, `database.connected` y `timestamp` ISO 8601 del contrato base. Se retiran unicamente los conteos opcionales `database.carts` y `database.wishlistItems`; no se consultan tablas de negocio ni se exponen errores del driver. `/live` conserva su contrato y no consulta DB.

Sandbox explícito solo development/test: JWT HS256, issuer marketplace-h3-sandbox, audience marketplace-h3, sub UUID, expiración obligatoria; comando local emite por 15 minutos. Producción prohíbe sandbox. La validación compartida acepta también RS256/JWKS con el contrato existente del carrito; eso no acredita homologación con Seguridad. Catálogo y condiciones comerciales siguen siendo MOCK.

GET `/api/v1/wishlist`: arreglo del titular, `createdAt DESC` con desempate id DESC.
Cada elemento incluye productId/createdAt, name/slug/brand/image/price y availability
AVAILABLE/OUT_OF_STOCK/UNAVAILABLE; retirados sin datos mantienen campos null.
Un catálogo fallido o incoherente produce 503, nunca falso vacío.

POST `/api/v1/wishlist/items/{productId}/add-to-cart`: sin cuerpo, query ni clave
idempotente. `200 {productId,cart}` confirmado; suma una unidad y conserva el
favorito y su fecha. Usa transacción y servicio de carrito compartidos, sin tabla
intermedia ni migración nueva. Repetir la petición constituye otra adición; ante
timeout consultar carrito, sin reintento automático. `/move-to-cart` no existe.

Adición: 409 CART_CONFLICT si no existe favorito propio o hay conflicto transaccional;
409 STOCK_LIMIT_REACHED si la cantidad total excede lo validado por el comercio
sandbox o el límite técnico. 422 VARIANT_SELECTION_REQUIRED incluye redirectUrl
restringido a `/productos/{slug}`; 503 COMMERCE_DATA_UNAVAILABLE sin cotización
válida; 503 AUTH_UNAVAILABLE ante indisponibilidad de autenticación. Resto de errores
según OpenAPI. En éxitos y rechazos el favorito permanece.

Todas las respuestas de favoritos usan Cache-Control: no-store, private. Deshacer
conserva DELETE seguido de POST tras confirmación; no garantiza fecha/posición
histórica ni restauración de producto inactivo. G-UNDO sigue pendiente.
