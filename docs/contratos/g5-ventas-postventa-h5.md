# Registro de contratos G5 para H5 — Issue #295 / TASK-H5-TEST-006

Estado: **cobertura de regresión G1 MOCK parcial; pruebas de contrato contra G5 e integración REAL bloqueadas**. Este registro no reemplaza un OpenAPI: G5 publica estos contratos como Markdown y el repositorio no contiene los YAML que las páginas describen como Swagger source.

El resumen H5 del equipo asigna a #295 pruebas de contrato para creación idempotente, `/me`, detalle y CSAT, y separa la integración REAL a sandboxes en #298. Esta rama solo permite afirmar la cobertura MOCK que se detalla abajo; no se presenta como contract testing contra M1/M2 ni como evidencia REAL. Las fuentes externas se consultaron en modo lectura, sin invocar sandboxes ni usar credenciales.

## Fuentes y versiones

| Servicio | Fuente fijada | Versión publicada |
|---|---|---|
| M1 Ventas | [`api-ventas.md` en `e36ac3c45dc97f8d19661ab3e4fc50d5e258877b`](https://github.com/Taller-SW-Web/G5-Ventas-Postventas/blob/e36ac3c45dc97f8d19661ab3e4fc50d5e258877b/specs/api/api-ventas.md) | **Inconsistente:** encabezado `1.9.0`; historial incluye `1.10.0` (2026-11-05), que añade `pago.comprobanteReferencia` opcional a 1.1. Confirmar con G5 cuál es la versión contractual antes de declarar homologación. |
| M2 Postventa | [`api-postventas.md` en `a217c695d64c100f29fc96db41ef90f320ac9e02`](https://github.com/Taller-SW-Web/G5-Ventas-Postventas/blob/a217c695d64c100f29fc96db41ef90f320ac9e02/specs/api/api-postventas.md) | `1.6.0` |

## Superficie relevante documentada

- **Crear pedido — M1 `POST /api/v1/pedidos` (1.1):** requiere token con `ventas:pedidos:crear` y `Idempotency-Key` UUID v4. El cuerpo de Marketplace requiere `canal`, `contacto`, `items`, `envio` y `pago`; `cupon` es opcional. Primer envío: `201`; mismo cuerpo y clave: `200` con el mismo pedido; misma clave y otro cuerpo: `409 IDEMPOTENCY_KEY_REUSED`; clave ausente/no UUID v4: `400 CABECERA_FALTANTE`.
- **Mis pedidos — M1 `GET /api/v1/pedidos/me` (1.4b):** token del usuario con rol `CLIENTE`; titularidad derivada de `sub`, sin aceptar `clienteId`. `page`/`pageSize` empiezan en 1 (page default 1; tamaño default 10, máximo 50). Filtros opcionales `estado`, `desde` y `hasta`; las fechas son `YYYY-MM-DD` inclusivas en hora de Perú y `desde > hasta` da `400 RANGO_FECHAS_INVALIDO`. La respuesta documentada usa `items`, `total`, `page`, `pageSize`; errores relevantes: `400 PAGINACION_INVALIDA`, `FORMATO_INVALIDO`, `401 TOKEN_INVALIDO` y `403 ACCESO_DENEGADO`.
- **Detalle — M1 `GET /api/v1/pedidos/{pedidoId}` (1.3):** token de titular `CLIENTE`, `ADMIN_VENTAS` o servicio con `ventas:pedidos:consultar`; responde `403 ACCESO_DENEGADO` para un cliente ajeno y `404 PEDIDO_NO_ENCONTRADO` si no existe. La respuesta incluye contacto y pago; minimizar esos datos antes de exponerlos sería una decisión de privacidad de G1, no una regla expresamente indicada en este fragmento del contrato G5.
- **CSAT — M2 `POST /api/v2/csat` (2.7):** token del cliente con rol `CLIENTE`; cuerpo con `pedidoId`, `clienteId`, `canal`, `puntuacion` (acuerdo H-04: `1`, `3` o `5`) y `comentario`. La propiedad del pedido se valida contra `sub`. Casos documentados: `201`, `400 PUNTUACION_INVALIDA/DATOS_INVALIDOS`, `403` por titularidad, `422 ORDER_NOT_DELIVERED` y `409 CSAT_ALREADY_SUBMITTED`.

## Estado de cobertura G1 (separación MOCK / REAL)

| Caso | Cobertura existente o límite | Clasificación |
|---|---|---|
| Crear pedido: idempotencia y respuesta incierta | `src/checkout/external/mock-http.adapter.spec.ts` y `src/checkout/checkout.service.spec.ts` prueban semántica de replay, conflicto de payload y recuperación de G1 contra fixtures/dobles locales. El fixture de `MarketplaceGateway` usa un DTO y un envelope distintos a M1; no verifica rutas, cuerpos, errores ni códigos HTTP publicados por G5. | Regresión MOCK de G1; no es contract test contra M1. |
| Historial `/me` | `test/orders.e2e-spec.ts` prueba **G1** `GET /api/v1/orders/me` con fixture. El proveedor `MockOrdersProvider` pagina desde 0 y devuelve `data/page`; no es el endpoint G5 `/api/v1/pedidos/me`, que pagina desde 1 y devuelve `items/total/page/pageSize`. | MOCK; no es contract test REAL contra M1. |
| Detalle de pedido y CSAT | No se encontró cliente/adaptador G1 para M1 1.3 ni M2 2.7. | Sin implementación que probar; no se crean endpoints ni requests supuestos. |
| Transporte REAL | `MarketplaceGateway` apunta a hosts `.mock` y falla cerrado con `USE_MOCKS=false`; `mock-http.adapter.spec.ts` comprueba que el gateway responde 503 antes de invocar `HttpService`. `OrdersService` permite sólo la fuente MOCK. | REAL bloqueado. |

La request interna actual de `MarketplaceGateway.createOrder` (`checkoutOperationId`, `contact`, `total`) y su respuesta interna (`total.amount/currency`, `createdAt`) **no** son el DTO de M1 (`canal`, `contacto`, `items`, `envio`, `pago`; `total` numérico, `moneda` y `fechaCreacion`). M1 documenta el objeto de pedido en la raíz, no dentro de `{data: ...}`; su error estándar usa `codigo`, `mensaje`, `timestamp` y `detalles`. En cambio, el gateway actual desenvuelve `response.data.data` y busca errores en `error.code`. El contexto persistido de checkout conserva líneas con `sku` y `quantity`, no todos los campos requeridos por M1 (por ejemplo, `productoId`, descripción y precio unitario). El contrato local de checkout tampoco fija el mapeo de `pago.metodoPago`. No se debe convertir estas diferencias en una traducción inventada.

## Evidencia y desbloqueo

- Las pruebas del gateway y de checkout usan datos sintéticos y son aptas para CI como regresión MOCK; no demuestran disponibilidad, autenticación, compatibilidad ni comportamiento de G5.
- Corrida ejecutada en esta revisión (2026-11-23): `npm run test:unit -- --runTestsByPath src/checkout/external/mock-http.adapter.spec.ts` pasó (1 suite, 6 tests); después `npm run test:unit` pasó (45 suites, 575 tests). Para ambas corridas se creó temporalmente un junction `node_modules` en este worktree hacia `C:\Users\Leo\Desktop\Marketplace_Project_Taller\G1-Marketplace-Backend\node_modules`, el árbol de dependencias ya instalado que se indicó como compartido; no se instalaron dependencias y el junction fue retirado al terminar. La suite completa emitió un warning de readiness `database unavailable`, pero finalizó correctamente. No se ejecutaron pruebas E2E, contra G5, DB o sandbox. Estas suites siguen siendo regresión MOCK y no evidencian compatibilidad REAL.
- La frontera REAL permanece bloqueada incluso antes de ejecutar pruebas: falta confirmar la versión contractual de M1, acordar con G5 la traducción request/response/error y disponer en G1 de soporte local para las operaciones cubiertas por #295. Solo después correspondería acordar URLs de sandbox, identidades y datos de prueba autorizados. La integración REAL de sandboxes está identificada por separado en el resumen H5 (#298); no se ejecutó aquí.
- Para desbloquear el trabajo de #295 sin inventar contratos: obtener de G5 la versión M1 confirmada y el OpenAPI/fuente contractual vigente; resolver el mapeo y completar la información del pedido que hoy no persiste checkout; implementar o identificar los clientes G1 para detalle y CSAT, y definir el cliente de `/me` de ventas. Hasta entonces se limita el alcance a regresiones MOCK existentes y se documenta el hueco.
- No se guardan tokens, datos personales ni respuestas reales en este registro.
