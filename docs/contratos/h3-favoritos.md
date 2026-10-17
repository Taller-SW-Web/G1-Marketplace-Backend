# Contrato local H3 — F-036/F-038 — v0.1.0

Precisión local de las specs vigentes, registrada antes de implementar. Estado: decisión de implementación del plan autorizado por Diego; revisión independiente y homologación externa pendientes. No modifica contratos de Seguridad/Productos ni libera gates. Propuesta de traslado a SPECS para revisión del equipo.

POST `/api/v1/wishlist/items`, Bearer JWT, cuerpo estricto `{"productId":"PRD-1"}`: 201 creado/200 existente, respuesta `{"productId":"PRD-1"}`. DELETE `/api/v1/wishlist/items/{productId}`: 204 sin cuerpo, incluyendo registro propio ausente. Identidad exclusivamente del token; no se admite `customerId` de entrada.

`productId`: string entre 1 y 100 caracteres Unicode, sin espacios exteriores ni controles U+0000–001F/U+007F–009F. Conservar el identificador sin transformaciones. Favorito por producto, no SKU. DELETE no consulta catálogo.

Errores `{code,message}`: 400 INVALID_REQUEST (JSON/cuerpo/campos adicionales), 400 INVALID_PRODUCT_ID, 401 UNAUTHORIZED, 404 PRODUCT_NOT_AVAILABLE, 503 CATALOG_UNAVAILABLE, 500 INTERNAL_ERROR. Health (`/`, `/health`, `/ready`): 200 con `status: "UP"` o 503 con `status: "DOWN"`; conserva `service`, `environment`, `database.connected` y `timestamp` ISO 8601 del contrato base. Se retiran unicamente los conteos opcionales `database.carts` y `database.wishlistItems`; no se consultan tablas de negocio ni se exponen errores del driver. `/live` conserva su contrato y no consulta DB.

Sandbox explícito solo development/test: JWT HS256, issuer marketplace-h3-sandbox, audience marketplace-h3, sub UUID, expiración obligatoria; comando local emite por 15 minutos. Producción prohíbe sandbox. Sin adaptador real, favoritos falla cerrado. Persistencia PostgreSQL real local; identidad/elegibilidad MOCK. No hay GET de favoritos, login ni undo nuevos.
