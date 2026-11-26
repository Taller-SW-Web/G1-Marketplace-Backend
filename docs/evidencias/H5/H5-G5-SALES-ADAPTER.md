# H5 — adaptador local G5 Ventas

## Baseline y prueba

- Fuente M1: `docs/contratos/fixtures/g5-pinned/ventas.yaml`, OpenAPI 1.10.0, commit `95325de5b9b1db44fcfb92e945256b604f0a86f7`.
- Provider aislado: `src/checkout/external/g5-sales.provider.ts`.
- Prueba local: `npx jest --runInBand --runTestsByPath src/checkout/external/g5-sales.provider.spec.ts`.
- El provider exige `G5_SALES_INTEGRATION_APPROVED=true`, `USE_MOCKS=false`, `VENTAS_BASE_URL` y `VENTAS_SERVICE_TOKEN`. El token se lee de configuración en ejecución; no se guarda en el árbol ni en fixtures.
- Las pruebas usan únicamente un servidor HTTP sintético ligado a `127.0.0.1`; no invocan APIs de Ventas ni G7.

## Secret scan del fixture

- Gitleaks 8.30.1 marcó como `generic-api-key` el UUIDv4 aleatorio usado como clave de idempotencia en el test offline. Se reemplazó por un UUIDv4 fijo, de baja entropía y exclusivamente sintético; el test sigue validando el formato requerido por M1.
- El commit publicado `62bea9f` conserva el valor anterior en el historial. No se reescribió: `.gitleaksignore` exceptúa únicamente el fingerprint de ese commit, ruta, regla y línea. Las detecciones actuales de código e historial pasan; no se ignoran reglas ni rutas completas.
- Esta excepción se limita al fixture descrito y no corresponde a una credencial operativa.

## Mapeo cubierto

- `POST /api/v1/pedidos`, header `Idempotency-Key` UUID v4 y cuerpo de `CrearPedidoRequest` canal `MARKETPLACE`.
- Respuestas M1 directas (no se presupone un sobre `{ data }`): `201` alta y `200` repetición idempotente.
- `GET /api/v1/pedidos/{pedidoId}` y proyección de `PedidoDetalle` (`pago.total`, `pago.moneda`, `fechaCreacion`).
- Se reconocen los estados de M1 1.10.0: `CREADO`, `PAGADO`, `EN_PREPARACION`, `DESPACHADO`, `ENTREGADO`, `ANULADO`.
- El `409 IDEMPOTENCY_KEY_REUSED` se conserva; fallos 401/403 no exponen respuesta ni credenciales del proveedor.

## Límites que mantienen bloqueado el uso desde Checkout

- `MarketplaceGateway` continúa usando `sales.mock` y falla cerrado con `USE_MOCKS=false`; el provider nuevo está registrado pero no conectado al flujo.
- El input actual de `CheckoutService` no contiene el `productoId`, precio unitario por línea, desglose subtotal/descuento/envío ni dirección completa requeridos por M1. No se inventa ese mapeo ni se altera persistencia/esquema para deducirlo.
- M1 1.10.0 no publica lectura por `Idempotency-Key`. El adaptador no crea una ruta `/by-idempotency-key`; tras timeout, la recuperación requiere repetir el mismo `POST` con el mismo cuerpo y clave, lo cual el flujo actual aún debe coordinar.
- Por ello, este provider y sus tests son preparación contractual, no compatibilidad G1↔G5 ni evidencia REAL. El entorno, token y ventana siguen sujetos a gates existentes.

## Historial autenticado (`GET /api/v1/orders/me`)

- El BFF protege la ruta con `AuthGuard` y deriva la identidad únicamente de `sub` del JWT verificado. No acepta `clienteId` del query ni headers de identidad.
- Para la fuente real, el adaptador llama `GET /api/v1/pedidos/me` con el mismo bearer de usuario (G5 exige rol `CLIENTE`), nunca con el token de servicio. Redirige páginas BFF base 0 a páginas G5 base 1 y valida/mapea la respuesta sin filtrar campos de Ventas.
- La fuente `real` requiere `AUTH_ENABLED=true`, `USE_MOCKS=false`, `G5_SALES_INTEGRATION_APPROVED=true` y `VENTAS_BASE_URL` como origen HTTPS. No hay URL ni token real en el repositorio. La respuesta es `no-store` y marca `X-Orders-Source: REAL`.
- Pruebas locales: `npx jest --runInBand --runTestsByPath src/orders/providers/g5-orders.provider.spec.ts` y `npx jest --runInBand --config ./test/jest-e2e.json --runTestsByPath test/orders.e2e-spec.ts`. Son tests offline/MOCK; no validan autorización ni datos reales de G5.

## Estado de checkout

- **Checkout REAL G5 permanece BLOQUEADO.** El provider aislado no está conectado a `MarketplaceGateway`/`CheckoutService`; esta evidencia no presenta la PR como integración G1↔G5. No conectar ni habilitar `POST /api/v1/pedidos` hasta cerrar todos los gaps de datos/contrato siguientes y recibir aprobación explícita de integración.
- Plan accionable previo a cualquier propuesta de conexión:
  1. Identificar fuentes autorizadas para `contacto.clienteId` (UUID), nombre, tipo/número de documento, teléfono/email y decidir minimización de PII.
  2. Completar el modelo/persistencia de cada línea con `productoId`, `sku`, `cantidad` y precio unitario cobrado. Hoy checkout conserva `sku`/`quantity`; no inferir producto ni precio de datos incompletos.
  3. Acordar `pago.metodoPago`, moneda, subtotal, descuentos/cupón, costo de envío y total; especificar precisión/redondeo y rechazar el envío si los valores no reconcilian. `comprobanteReferencia` es opcional.
  4. Definir captura/persistencia y mapeo de `envio.modalidad`, `costo`, `destinatario`, `departamento`, `provincia`, `distrito`, `direccion` y referencia opcional. La dirección completa/desglose no está hoy disponible en la operación persistida.
  5. Persistir UUID v4 `Idempotency-Key` con el cuerpo exacto y reusar ambos en reintentos tras timeout; M1 no ofrece consulta por clave. Adaptar respuesta raíz y errores M1 (`codigo`), no el envelope/error-code del gateway.
  6. Acordar e implementar/testear por separado M1 `/me` y detalle y M2 CSAT, incluidos sus tokens/roles, paginación y origen de `clienteId`; el provider de creación no los cubre.
  7. Acordar los contratos/datos con G1 y Ventas, añadir pruebas offline y revisión de privacidad/seguridad, y obtener aprobación explícita del entorno/credenciales/ventana antes de proponer un cambio de activación REAL separado.
- Mientras cualquiera de esos puntos o la aprobación siga pendiente, el flujo debe permanecer fail-closed. La aprobación/configuración sola no suple los campos ni constituye autorización para esta PR.
- El test solicitado con cuentas A/B requiere además el despliegue aprobado, acceso a dos tokens de usuario por canal seguro y una ventana coordinada con Ventas. Ninguna prueba aquí envía pedidos reales ni usa credenciales.
