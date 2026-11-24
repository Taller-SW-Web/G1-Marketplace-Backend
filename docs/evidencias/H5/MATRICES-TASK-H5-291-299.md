# H5 · matrices de integración y trazabilidad (#291 / #299)

**Corte:** 24/11/2026 · **Propósito:** plan verificable y estado offline. No se invocaron APIs de negocio, sandboxes ni despliegues; ninguna celda `LOCAL` o `PIN` acredita integración REAL.

## Fuentes fijadas y leyenda

| Módulo | Fuente revisada | Alcance local comprobable |
|---|---|---|
| G6 Productos y Ofertas | OpenAPI `0.7.0-rc.3`, repo de docs commit `40524e96c6973f84d74160076781702fe2a3da19`, blob `e094988f0f0d92a7a4241c1dc30a5e50d9ff709a` | Extracto offline #293 (6/6); adaptadores sintéticos locales separados para precio/disponibilidad (10/10). Pin/adaptadores no acreditan homologación, grants ni runtime G6. |
| G7 Seguridad y Usuarios | OpenAPI `1.0.0`, commit `1b8f2e35448075a6c396b70fdd4ec1d5b1aa9201` | Prism local y dobles HTTP de G1; no prueban JWT/grants, persistencia ni correo de G7. |
| G5 Ventas y Postventa | M1 OpenAPI `1.10.0` y M2 `1.6.0`, commit `95325de5b9b1db44fcfb92e945256b604f0a86f7` | Snapshot offline sanitizado #295; no compara upstream al ejecutar ni prueba adaptadores G1. |
| G2 Despacho y Entrega | Contrato Markdown fijado al commit `2bd99a23df22329d42ca9806b4debe9adcc05999` | No es OpenAPI. G1 no tiene el cliente que permita un ensayo HTTP contractual para estas operaciones. |

`LOCAL` = prueba solo con HTTP local/Prism/doble. `PIN` = aserción sobre snapshot estático; no es comportamiento. `BLOCKED` = sin adaptador/contrato estructurado o depende de coordinación externa. `NOT-COVERED` = caso válido aún sin test en el conjunto inspeccionado. `N/A` = no aplica semánticamente. `401/403` en una operación pública se marca `N/A`; no se extrapola de otra ruta.

## #291 · operación × caso

| Módulo / operación | Positivo | Vacío | 4xx | Timeout | 5xx | Duplicado | 401/403 | Test / límite |
|---|---|---|---|---|---|---|---|---|
| G6 `GET /categorias` y `GET /productos` (catálogo y búsqueda) | LOCAL | LOCAL | LOCAL: entrada 400 y proveedores 401/403 mapeados a 503 | LOCAL: búsqueda | LOCAL: 503 | N/A | LOCAL: rechazo técnico de proveedor, no autorización REAL | `test/catalog-g6-contract.e2e-spec.ts`; `test/catalog.e2e-spec.ts`. Solo simulador HTTP local. |
| G6 `GET /productos/por-slug/{slug}` (detalle) | LOCAL | N/A | LOCAL: 404 proveedor→404, payload inválido→502, slug inválido→400 | LOCAL: timeout proveedor→504 | LOCAL: 401 proveedor→503; 403 no cubierto para detalle | N/A | 401 es respuesta de proveedor ensayada, no validación REAL de scopes | `test/catalog-public-detail.e2e-spec.ts`; servidor HTTP efímero. No se ensaya `/productos/{productoId}`. |
| G6 `GET /productos/{productoId}` | PIN | N/A | PIN: códigos declarados; no se envía request | NOT-COVERED | PIN: 500/503 declarados | N/A | PIN: 401/403 declarados; scope sin registrar | `test/g6-pinned-openapi.spec.ts`; no existe consumidor G1 de esta ruta en el adaptador auditado. |
| G6 `GET /precios/skus/{sku}` (precio) | PIN + LOCAL | N/A | PIN + LOCAL: mapeos y fallos en doble HTTP | LOCAL: timeout sintético | LOCAL: error sintético | N/A | LOCAL: 401/403 sintéticos, no grants | `src/catalog/g6-commerce.adapter.spec.ts` en `G1-Marketplace-Backend-h5-g6-adapters`; `npm run test:g6:commerce-adapter:offline` (10/10). Adapter no conectado; F-012 REAL sigue bloqueada. |
| G6 `GET /inventario/disponibilidad/comercial` | PIN + LOCAL | N/A | PIN + LOCAL: mapeos y fallos en doble HTTP | LOCAL: timeout sintético | LOCAL: error sintético | N/A | LOCAL: 401/403 sintéticos, no grants | Mismo test offline (10/10). Operación provisional; adapter no conectado y no acredita disponibilidad REAL de F-014. |
| G7 `POST /auth/registro` | LOCAL | N/A | LOCAL: 409/422 de ejemplos Prism | NOT-COVERED | PIN/NOT-COVERED | LOCAL: 409 de contrato | N/A | `node --test test/g7-prism-contract.test.mjs`; ejemplos Prism, no estado de G7. |
| G7 `POST /auth/login` | LOCAL | N/A | LOCAL: 401 Prism | NOT-COVERED | PIN/NOT-COVERED | LOCAL: 401; 403 N/A | N/A | Misma suite Prism; no usa credenciales reales. |
| G7 `POST /auth/otp/solicitar` | LOCAL | N/A | LOCAL: 429 Prism | NOT-COVERED | PIN/NOT-COVERED | N/A | N/A | Misma suite Prism; no demuestra entrega de OTP. |
| G7 `POST /auth/otp/verificar` | LOCAL | N/A | LOCAL: 401/410 Prism | NOT-COVERED | PIN/NOT-COVERED | LOCAL: 401; 403 N/A | N/A | Misma suite Prism; respuestas de ejemplo. |
| G7 `POST /auth/verificar-correo` | LOCAL: 204 | N/A | LOCAL: 410 expirado/usado | NOT-COVERED | PIN/NOT-COVERED | N/A | N/A | `test/g7-prism-contract.test.mjs`; ejemplos de Prism, no correo ni estado G7 persistido. |
| G7 `POST /auth/verificar-correo/reenviar` | LOCAL: 202 | N/A | LOCAL: 429 Prism | NOT-COVERED | PIN/NOT-COVERED | N/A | N/A | Misma suite; no entrega de correo real ni comportamiento de rate-limit desplegado. |
| G7 `POST /auth/refresh` / `POST /auth/logout` | LOCAL | LOCAL: logout 204 | LOCAL: refresh/logout 401 Prism | NOT-COVERED | PIN/NOT-COVERED | LOCAL: reutilización/estado ilustrado en ejemplos; no persiste rotación Prism | LOCAL: 401; 403 N/A | Prism más `test/auth-g7.e2e-spec.ts` con dobles locales. La revocación y sesiones G7 reales siguen pendientes. |
| G7 `POST /password/recuperar` / `POST /password/restablecer` | LOCAL | LOCAL: recuperación 202 neutral / reset 204 | LOCAL: 401/410/422/429 Prism | NOT-COVERED | PIN/NOT-COVERED | NOT-COVERED: replay de token reset no probado | N/A | Prism y `test/password-reset-g7.e2e-spec.ts`; no prueba correo ni expiración en G7. |
| G7 `GET /auth/.well-known/jwks.json` | LOCAL | N/A | N/A | NOT-COVERED | LOCAL: 503 Prism | N/A | N/A | Suite Prism, GET público a mock local; no valida firma contra JWKS desplegado. |
| G7 `GET /password/politica` | LOCAL | N/A | NOT-COVERED | NOT-COVERED | NOT-COVERED | N/A | N/A | Suite Prism valida solo respuesta positiva local. |
| G7 `GET /usuarios/{id}` | LOCAL | N/A | LOCAL: 401 Prism | NOT-COVERED | PIN/NOT-COVERED | N/A | LOCAL: 401; 403 no cubierto | Suite Prism usa token fixture; la lectura REAL solo es pública para JWKS/política y no se ejecutó aquí. |
| G5 M1 `POST /api/v1/pedidos` (crear/idempotencia) | PIN + LOCAL | N/A | PIN + LOCAL: mapeos/códigos con doble sintético | LOCAL: timeout sintético; recuperar por replay aún no integrado | PIN + LOCAL: errores sintéticos | PIN + LOCAL: `Idempotency-Key`/repetición sintética | PIN + LOCAL: auth simulada | Provider aislado `src/checkout/external/g5-sales.provider.spec.ts` en worktree #295, 5/5; `npm run test:pinned-spec:offline` 6/6. El flujo Checkout no invoca este provider y no tiene todavía el mapeo/idempotency recovery requerido. |
| G5 M1 `GET /api/v1/pedidos/me` | PIN + LOCAL | PIN + LOCAL: respuesta vacía mapeada por prueba local | PIN + LOCAL: errores de provider sintético | LOCAL: timeout sintético | PIN + LOCAL: errores sintéticos | N/A | PIN + LOCAL: auth simulada | `src/orders/providers/g5-orders.provider.spec.ts` en worktree #295, 3/3. No acredita sesión/roles ni datos de G5. |
| G5 M1 `GET /api/v1/pedidos/{pedidoId}` | PIN + LOCAL | N/A | PIN + LOCAL: 403/404 sintéticos | LOCAL: timeout sintético | PIN + LOCAL: error sintético | N/A | PIN + LOCAL: auth simulada | Provider aislado de Ventas en worktree #295; test de órdenes 3/3, no demuestra lectura contra G5. |
| G5 M1 `POST /api/v1/webhooks/ventas/envios` → receptor G1 | LOCAL + BLOCKED | N/A | LOCAL: auth/schema inválidos | LOCAL: sólo límite de transporte de test en memoria | LOCAL: sink por defecto responde 503 | LOCAL: doble demuestra repetición sin segundo efecto durable | LOCAL: auth configurable en doble local | `src/webhooks/ventas/shipment-webhook.spec.ts` en worktree webhook (9/9). Sin sink transaccional/outbox productivo, G2 Specs #42 y coordinación #318 abiertos; no hay entrega/deduplicación durable. |
| G5 M2 `POST /api/v2/csat` | PIN | N/A | PIN: 400/403/409/422 documentados | BLOCKED | PIN: status documentados, sin requests | PIN: duplicado documentado | PIN: autorización documentada | Mismo test #295; no hay adaptador CSAT G1. |
| G2 `POST /api/v1/cotizaciones` | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | N/A | BLOCKED | Contrato Markdown fijado; sin OpenAPI pinneado ni consumidor G1 bajo prueba. No fabricar fixtures HTTP. |
| G2 `GET /api/v1/seguimientos/pedidos/{idPedido}` | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | N/A | BLOCKED | Mismo límite; operación de lectura no acredita comportamiento por estar descrita. |
| G2 `POST /api/v1/integraciones/despachos/eventos` hacia G5 | BLOCKED | N/A | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED | El contrato fija emisor/destinatario e idempotencia por `idEvento`; no se crea consumidor ni webhook G1. |

Los status `PIN` se contrastan solo en snapshot local. La prueba HTTP G6 usa un servidor local que devuelve respuestas sintéticas; Prism sirve ejemplos del contrato G7. Ninguno es un run REAL ni se usa para cerrar un gate externo.

## #299 · trazabilidad F ↔ test ↔ comando reproducible

Los comandos son recetas para reproducir pruebas locales, no identificadores de una ejecución nueva. `MOCK/LOCAL` describe su frontera. Los IDs no implementados conservan `—` y su bloqueo en lugar de heredar cobertura de una pantalla o contrato. Para una corrida registrada del corte de develop, véase [VERIFICACION-DEVELOP.md](VERIFICACION-DEVELOP.md); es una verificación histórica, no un run por fila ni del commit de esta rama.

| F | Funcionalidad | Test existente | Comando reproducible | Estado / traza |
|---|---|---|---|---|
| F-001 | Registro | `test/account-g7.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/account-g7.e2e-spec.ts` | LOCAL; no correo REAL. |
| F-002 | Inicio de sesión / MFA | `test/auth-g7.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/auth-g7.e2e-spec.ts` | LOCAL; sesión contra dobles. |
| F-003 | Cierre de sesión | `test/auth-g7.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/auth-g7.e2e-spec.ts` | LOCAL; no acredita revocación G7. |
| F-004 | Solicitud de recuperación | `test/recovery-qa.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/recovery-qa.e2e-spec.ts` | LOCAL; no correo REAL. |
| F-005 | Restablecimiento | `test/password-reset-g7.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/password-reset-g7.e2e-spec.ts` | LOCAL; tokens sintéticos. |
| F-006 | Inicio/categorías/destacados | `test/catalog.e2e-spec.ts`; `test/catalog-g6-contract.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/catalog.e2e-spec.ts test/catalog-g6-contract.e2e-spec.ts` | MOCK + HTTP local controlado; no deployment G6. |
| F-007 | Búsqueda | `test/catalog.e2e-spec.ts`; `test/catalog-g6-contract.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/catalog.e2e-spec.ts test/catalog-g6-contract.e2e-spec.ts` | MOCK + HTTP local; búsqueda vacía cubierta. |
| F-008 | Filtros | `test/catalog.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/catalog.e2e-spec.ts` | MOCK; contrato G1, no runtime G6. |
| F-009 | Ordenamiento | `test/catalog.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/catalog.e2e-spec.ts` | MOCK; contrato G1. |
| F-010 | Paginación | `test/catalog.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/catalog.e2e-spec.ts` | MOCK; incluye página vacía. |
| F-011 | Detalle de producto | `test/product-detail.e2e-spec.ts`; `test/catalog-public-detail.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/product-detail.e2e-spec.ts test/catalog-public-detail.e2e-spec.ts` | MOCK + doble HTTP local; no G6 desplegado. |
| F-012 | Precio/oferta | `test/product-commerce.e2e-spec.ts`; `test/openapi-contract.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/product-commerce.e2e-spec.ts test/openapi-contract.e2e-spec.ts` | BFF MOCK; el upstream G6 precio queda bloqueado. |
| F-013 | Variantes | `test/product-commerce.e2e-spec.ts`; `test/catalog-public-variants.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/product-commerce.e2e-spec.ts test/catalog-public-variants.e2e-spec.ts` | MOCK/HTTP local; sin afirmar adaptador REAL de variantes. |
| F-014 | Disponibilidad | `test/product-commerce.e2e-spec.ts`; `test/openapi-contract.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/product-commerce.e2e-spec.ts test/openapi-contract.e2e-spec.ts` | BFF MOCK; upstream G6 provisional, no recorrido REAL. |
| F-015 | Productos relacionados | `test/product-commerce.e2e-spec.ts`; `test/openapi-contract.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/product-commerce.e2e-spec.ts test/openapi-contract.e2e-spec.ts` | MOCK; no fuente REAL homologada. |
| F-016 | Agregar ítem al carrito | `test/cart.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/cart.e2e-spec.ts` | LOCAL con datos sintéticos. |
| F-017 | Cambiar cantidad | `test/cart.e2e-spec.ts`; `src/cart/cart.service.spec.ts` | `npm run test:e2e -- --runTestsByPath test/cart.e2e-spec.ts` | LOCAL; validación de cantidad y concurrencia propia. |
| F-018 | Quitar ítem | `src/cart/cart.service.spec.ts` | `npm run test:unit -- --runTestsByPath src/cart/cart.service.spec.ts` | Unit local; idempotencia propia, no servicio externo. |
| F-019 | Visualizar carrito | `test/cart.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/cart.e2e-spec.ts` | LOCAL; snapshot sintético. |
| F-020 | Fusionar carrito anónimo | `src/cart/cart.service.spec.ts` | `npm run test:unit -- --runTestsByPath src/cart/cart.service.spec.ts` | Unit local; no prueba recorrido de navegador/G7. |
| F-021 | Mover carrito a favoritos | `src/cart/cart.service.spec.ts` (`moveItemToWishlist`) | `npm run test:unit -- --runTestsByPath src/cart/cart.service.spec.ts` | Unit local; no HTTP E2E enlazada a F-021. `wishlist-handoff.integration-spec.ts` cubre la dirección contraria (favorito → carrito), no se atribuye a esta F. |
| F-022 | Dirección de envío | `test/checkout.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/checkout.e2e-spec.ts` | Doble/Prism local; G-ADDRESS REAL pendiente. |
| F-023 | Resumen/cotización de envío | `test/checkout.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/checkout.e2e-spec.ts` | MOCK; G2 cotización REAL pendiente. |
| F-024 | Cupón/promoción | `test/checkout.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/checkout.e2e-spec.ts` | MOCK; G6 beneficios REAL pendiente. |
| F-025 | Preparar pago / revalidar stock | `test/checkout.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/checkout.e2e-spec.ts` | MOCK/dobles; no cobra ni acredita reserva G6. Existe además una suite PostgreSQL opt-in, no ejecutada aquí. |
| F-026 | Crear orden | `test/checkout.e2e-spec.ts`; provider offline `g5-sales.provider.spec.ts` | `npm run test:e2e -- --runTestsByPath test/checkout.e2e-spec.ts` · provider en worktree #295: `npx jest --runInBand --runTestsByPath src/checkout/external/g5-sales.provider.spec.ts` | Checkout sigue MOCK/dobles y no llama al provider; suite de provider (5/5) usa servidor sintético. G5 REAL bloqueada por mapeo persistido/idempotencia. PostgreSQL opt-in no ejecutado. |
| F-027 | Confirmar orden | `test/checkout.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/checkout.e2e-spec.ts` | MOCK; éxito final requiere respuesta autoritativa G5. |
| F-028 | Historial de pedidos | `test/orders.e2e-spec.ts`; provider G5 M1 aislado | `npm run test:e2e -- --runTestsByPath test/orders.e2e-spec.ts` · ver además tests G5 en worktree #295 | MOCK por defecto; mapeo G5 preparado y probado con doble local, no acredita roles/datos ni ejecución REAL. |
| F-029 | Filtrar historial | — | — | GAP; no se encontró test/consumidor G5 en el backend actual. |
| F-030 | Detalle de pedido | — | — | BLOCKED; falta adaptador G5 M1.3. |
| F-031 | Reordenar compra | — | — | BLOCKED; falta recorrido/contrato de consumo G5 y su cobertura. |
| F-032 | Seguimiento de despacho | — | — | BLOCKED; contrato G2 Markdown, sin adaptador G1 ni prueba HTTP contractual. |
| F-033 | Generar plantilla de correo | — | — | BLOCKED; no se afirma proveedor ni test de correo. |
| F-034 | Enviar confirmación asíncrona | — | — | BLOCKED; faltan contrato/canal acordados; no RabbitMQ. |
| F-035 | Actualización de despacho | webhook local `shipment-webhook.spec.ts` | `npx jest --runInBand --runTestsByPath src/webhooks/ventas/shipment-webhook.spec.ts` en worktree webhook | LOCAL: 9/9 HTTP en memoria; el sink productivo fail-closed da 503. Sin persistencia/outbox ni acuerdo G2/G5 (#42/#318); entrega REAL BLOCKED. |
| F-036 | Agregar favorito | `test/wishlist.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/wishlist.e2e-spec.ts` | LOCAL; no integración externa. |
| F-037 | Visualizar favoritos | `test/wishlist-handoff.integration-spec.ts` (lectura/listado; PostgreSQL opt-in) | `npm run test:integration` | LOCAL; requiere DB aislada y `H3_ALLOW_TEST_DATABASE_WRITES=true`. No se ejecutó ni se considera run de esta matriz. |
| F-038 | Quitar favorito | `test/wishlist.e2e-spec.ts` | `npm run test:e2e -- --runTestsByPath test/wishlist.e2e-spec.ts` | LOCAL; propiedad/idempotencia cubiertas. |
| F-039 | Mover favorito al carrito | — | — | GAP/BLOCKED; no declarar implementado el alcance original por el handoff actual. |
| F-040 | Evaluación post-entrega / CSAT | — | — | BLOCKED; falta adaptador G5 M2.7. |

### Correlación y criterio de run

- El middleware `src/http/request-id.middleware.ts` conserva un `X-Request-Id` seguro o genera UUID y lo devuelve. Algunas suites comprueban además la cabecera y el paso `X-Correlation-Id` hacia el doble G6.
- `src/http/access-log.middleware.ts`, montado globalmente después del middleware de request-id, emite `http_access` al terminar cada respuesta con `requestId`, método, plantilla estática de ruta, status y duración. No registra URL cruda, query, cabeceras ni cuerpos. Las pruebas unitarias cubren plantilla, fallback, status y datos sensibles; `test/health.e2e-spec.ts` captura el evento desde `configureApp` para `/live` (200) y una ruta inexistente (404) con Supertest en proceso local. Es una comprobación `LOCAL` del logger, no un run de feature de negocio ni evidencia REAL.
- Esta instrumentación no crea runs para rutas no ejecutadas: F-029, F-030–F-034, F-039 y F-040 conservan sus estados GAP/BLOCKED. F-035 conserva una prueba LOCAL, pero la entrega REAL sigue BLOCKED. La trazabilidad completa F↔test↔run de #299 permanece parcial hasta registrar runs identificables para cada feature operativa y mantener explícitas las no cubiertas.
- Antes de declarar una fila corrida, registrar SHA de código, comando exacto, entorno LOCAL/MOCK o REAL, resultado/casos y run CI. Para REAL, agregar además autorización, proveedor/SHA y traza sanitizada. No guardar tokens, PII ni bodies reales.
- Ningún run de este documento habilita caché, activa adapters G5/G2, o autoriza G7, APIM, RabbitMQ o carga k6.

## Actualización del corte 24/11/2026

- Suites repetidas offline: `npm run test:h5-matrices` **2/2**; `npm run test:h5-k6:static` **4/4**; `npm run test:apim-policy` **6/6**; G6 pinned **6/6**; adaptadores G6 de precio/disponibilidad **10/10**; provider G5 M1 **5/5**, provider de historial **3/3**; receptor webhook **9/9**. Typechecks de los worktrees G5/G6/webhook pasan. Son verificaciones separadas con snapshots o dobles locales, no un run REAL conjunto.
- APIM: sigue pendiente decisión de header público `X-Request-Id` (BFF) frente a `X-Correlation-Id` (policy APIM/interfaz interna G1→G6). No se cambió el contrato, no se inventó alias y no se activó caché (`no-store`/TTL 0).
- RabbitMQ: análisis offline de `docs/checklists/H5-ASYNC-002-BLOQUEADO.md` confirma contrato borrador sin aceptación Marketplace, acuerdo de broker ausente y política de ack/retry/DLQ/idempotencia sin cerrar. No se añadieron dependencias, consumidor ni fixtures de tráfico.
- #301/#302: el test estático valida sintaxis, guardas loopback/IP literal, modo MOCK/opt-in, endpoints de lectura y umbrales p95 <800 ms / error <1%; no se ejecutó perfil k6. #306 requiere runner, entorno y ventana autorizados.
- #149: ocho capturas locales V-011–V-014 desktop/móvil documentadas en el worktree frontend; fixtures, sin backend/cobro. No alteran los estados REAL de las matrices.
