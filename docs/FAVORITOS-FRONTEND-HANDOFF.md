# Handoff de favoritos — contrato backend vigente v0.2.0

Restricción operativa vigente del usuario (17/10/2026): no ejecutar operaciones sobre
bases de datos. Los procedimientos con PostgreSQL mencionados aquí quedan pendientes
de una autorización posterior expresa; no forman parte de la validación automática.
No se modifica la funcionalidad de la API: agregar conserva el favorito.

## Decisión vigente del usuario

Esta sección sustituye la propuesta histórica reproducida más abajo: **agregar al
carrito y conservar el favorito, sin tabla de movimientos ni idempotencia durable**.
El backend no implementa `/move-to-cart` ni requiere migraciones nuevas. La propuesta
original F-039 de mover/eliminar no se declara implementada ni homologada en SPECS.

| Backend vigente | Resultado |
|---|---|
| `GET /api/v1/wishlist` | Arreglo del titular por `createdAt DESC`, desempate por id descendente. |
| `POST /api/v1/wishlist/items` | `{productId}`; `201/200`, conserva fecha existente. |
| `DELETE /api/v1/wishlist/items/{productId}` | `204`, incluso ausente; no consulta catálogo. |
| `POST /api/v1/wishlist/items/{productId}/add-to-cart` | Sin cuerpo ni `Idempotency-Key`; `200 {productId,cart}`. Agrega una unidad y conserva el favorito. |

GET conserva el DTO de proyección propuesto abajo: campos explícitos, sin envelope
ni customerId, `[]` solo para vacío confirmado, retirados `UNAVAILABLE`, agotados
`OUT_OF_STOCK`, fallo/proyección incoherente `503 CATALOG_UNAVAILABLE`.

La adición valida el favorito propio, resuelve SKU simple desde el catálogo sandbox
y reutiliza CartService dentro de una transacción. Valida cantidad total y cotización
sandbox. Nunca utiliza productId como SKU ni confirma reservas. Devuelve snapshot
autoritativo con cartId no nulo y cantidad actual. Cualquier rechazo revierte la
adición; el favorito permanece también en los éxitos. Dos solicitudes explícitas
aceptadas agregan dos unidades. Un timeout no permite saber si se confirmó: consultar
el carrito; no reintentar automáticamente ni prometer deduplicación tras reiniciar.

Errores de adición: `400 INVALID_REQUEST`/`INVALID_PRODUCT_ID`, `401 UNAUTHORIZED`,
`404 PRODUCT_NOT_AVAILABLE`, `409 CART_CONFLICT` (favorito ausente o carrito ocupado),
`409 STOCK_LIMIT_REACHED`, `422 VARIANT_SELECTION_REQUIRED` con ruta interna
`redirectUrl`, `503 CATALOG_UNAVAILABLE`/`COMMERCE_DATA_UNAVAILABLE`/`AUTH_UNAVAILABLE`,
`500 INTERNAL_ERROR`. No se exponen tokens, stacks ni cuerpos externos.

Identidad compartida con carrito: JWT sandbox HS256 únicamente en development/test
habilitado, o JWT RS256/JWKS verificado. Sin credenciales no hay acceso a favoritos;
el carrito conserva su acceso anónimo. HTTP/PostgreSQL son reales locales, catálogo,
condiciones comerciales e identidad de demostración son MOCK. Integraciones externas
y G-AUTH/I-01/G-SKU/G-QUANTITY/G-UNDO permanecen pendientes.

## Ajustes que debe realizar el responsable frontend

- Mantener el BFF y los tokens en servidor; todas las respuestas privadas usan
  `Cache-Control: no-store, private`.
- Lectura: utilizar el GET existente del BFF y habilitar `H3_WISHLIST_READ_ENABLED`
  solo después de verificar DTO y casos A/B con Nest/PostgreSQL.
- Sustituir la ruta BFF y transporte `/move-to-cart` por `/add-to-cart`; reenviar
  POST sin cuerpo y sin clave idempotente. Cambiar botón/mensajes a «Agregar al carrito».
- Admitir `503 AUTH_UNAVAILABLE` como error sanitizado de autenticación; no convertir
  esa indisponibilidad en éxito, lista vacía o cierre de sesión por 401.
- Tras éxito, conservar la tarjeta, su fecha y su estado de favorito; actualizar
  carrito con el snapshot confirmado. Eliminar la lógica de replay de movimientos.
- Bloquear nuevos clics mientras la petición está pendiente. Ante resultado incierto,
  mantener favorito y consultar carrito; no reintentar la adición automáticamente.
- Mantener `H3_WISHLIST_MOVE_ENABLED=false`: el BFF actual no es compatible con este
  cambio. Introducir `H3_WISHLIST_ADD_ENABLED=false` por defecto y habilitar solo en
  sandbox después de adaptar y probar el flujo. No activar auth de producción.
- Ampliar E2E conectado sin interceptar HTTP: listado A/B, vacío/503, agregar con
  tarjeta conservada, segunda adición explícita, variantes, agotado y sesión vencida.
  Verificar filas de favoritos y cantidades del carrito en la base temporal.

No se modificó el repositorio frontend. Su runner conectado actual verifica
guardar/quitar; no acredita estos flujos nuevos. Instrucciones y fixtures:
[entrega backend](H3-FAVORITOS-INTEGRACION.md). OpenAPI vigente:
[v0.2.0](contratos/openapi-h3.json).

## Propuesta histórica sustituida en lo relativo al movimiento

El contenido siguiente se conserva como fuente original. Los requisitos de
`move-to-cart`, eliminación tras éxito, claves durables, migración y retención
**no son el contrato vigente**; fueron reemplazados por la decisión anterior.

Fecha: 2026-10-16. Estado: propuesta de contrato pendiente de implementación y validación en Backend. No acredita homologación de Productos/Seguridad, cierre de gates ni integración real. Frontend implementa las vistas y adaptadores; este encargo solicita los endpoints restantes. No implementar ficha, login ni vistas de carrito en este corte.

## Fuentes y decisiones

- SPECS: `SPECS/funcional`, `SPECS/contrato-api`, `SPECS/componentes-react` F-036–039; `SPECS/ui/vistas/V-009-favoritos.md`; overlays O-003/O-006/O-010; `plan/DECISIONES-Y-BLOQUEOS.md` (I-01, G-AUTH, G-SKU, G-UNDO).
- Figma: archivo `k6JZRdgbO7YtZXeFqygE8p`, página `1:4`; V-009 `206:3140`, `206:3224`, `206:3299`, `206:3362`, `206:3393`, `206:3483`, `206:3514`, `206:3599`, `206:3685`, `206:3761`; O-006 `215:2976`, `215:3135`.
- Decisiones del usuario: SPEC funcional prevalece sobre Figma; favoritos por producto, nunca selección persistida de talla/SKU; agotados separados de retirados; no porcentajes ni reserva de 20 minutos ficticios. Deshacer mediante POST después de DELETE confirmado; puede fallar. Idempotencia durable para movimiento.
- El módulo de carrito ya existe. Reutilizarlo; no reproducir sus reglas en Wishlist ni llamar dos endpoints desde el navegador.

## Operaciones requeridas

| Backend | BFF Next | Situación |
|---|---|---|
| `GET /api/v1/wishlist` | `GET /api/wishlist` | Falta backend; lectura del titular, orden `createdAt DESC`. |
| `POST /api/v1/wishlist/items` | `POST /api/wishlist/items` | Existente; conservar `{productId}` y `201/200`. También restaura tras quitar. |
| `DELETE /api/v1/wishlist/items/{productId}` | DELETE equivalente | Existente; `204`, incluso ausente; aislado por titular. |
| `POST /api/v1/wishlist/items/{productId}/move-to-cart` | POST equivalente | Falta backend; cuerpo vacío y cabecera `Idempotency-Key` UUID v4. |

Ninguna operación recibe customerId del cliente. Backend deriva titular del JWT. BFF conserva tokens en servidor, usa cookie HttpOnly opaca y `Cache-Control: no-store, private`. El sandbox sigue limitado a development/test; no activar en producción para suplir G-AUTH.

## GET: propuesta exacta consumida por frontend

Respuesta `200`: arreglo (no envelope `data`). `[]` solo significa lista confirmada vacía.

```json
[
  {
    "productId": "PRD-1",
    "createdAt": "2026-10-16T12:00:00.000Z",
    "name": "Producto de prueba",
    "slug": "producto-de-prueba",
    "brand": "Marca",
    "image": {"url": "https://example.com/product.png", "alt": "Producto de prueba"},
    "price": {"amount": 349.9, "currency": "PEN"},
    "availability": "AVAILABLE"
  }
]
```

| Campo | Regla |
|---|---|
| `productId` | String contractual F-036: 1–100 caracteres Unicode, sin espacios exteriores ni controles; único en el arreglo. |
| `createdAt` | Fecha ISO de guardado, del backend; mantener orden descendente. POST idempotente no renueva fecha de un registro existente. |
| `name`, `slug` | Requeridos salvo `UNAVAILABLE`, donde pueden ser null. Slug `[a-z0-9]+(?:-[a-z0-9]+)*`. |
| `brand` | String o null; no usar IDs internos como marca visible. |
| `image` | Objeto `{url,alt}` o null. URL HTTPS; fixtures locales `/figma/...` o `/fixtures/...` solo en sandbox. |
| `price` | Objeto `{amount,currency}` o null. Importe finito no negativo, moneda ISO de tres letras. Informativo; no recalcular compra. |
| `availability` | `AVAILABLE`, `OUT_OF_STOCK` o `UNAVAILABLE`. Estado comercial de producto, no saldo numérico ni elegibilidad de una talla arbitraria. |

Para retirado sin datos: conservar productId/createdAt, campos de catálogo null, `UNAVAILABLE`. Frontend usa texto e imagen neutros; no borra intención. Si Catálogo falla globalmente o no permite una proyección coherente, responder `503 CATALOG_UNAVAILABLE`; jamás convertirlo en `[]`, agotado supuesto ni precio cero.

## Movimiento atómico e idempotencia

Respuesta `200` propuesta:

```json
{
  "productId": "PRD-1",
  "cart": {
    "cartId": "uuid-del-carrito",
    "version": 4,
    "items": [
      {"sku": "SKU-SIMPLE", "quantity": 1, "unitPrice": {"amount": 349.9, "currency": "PEN", "version": 8}}
    ]
  }
}
```

El snapshot reutiliza la proyección del carrito: sku único, quantity entero 1–99, version entera no negativa. `unitPrice` puede omitirse si el contrato de carrito no lo ofrece; si se devuelve, todos sus campos son requeridos. `cartId` no es null en un movimiento confirmado. No devuelve reservas ni saldos internos.

Secuencia en backend:

1. Autenticar titular común de Wishlist/Cart. Los guards actuales usan contratos distintos (sandbox HS256 frente al validador de carrito); resolver identidad en un límite compartido. No degradar a carrito anónimo por token no reconocido ni confiar en sub decodificado sin validar.
2. Registrar/reconocer la clave idempotente vinculada a titular, operación y productId. Reutilizar clave con otro producto devuelve conflicto.
3. Bloquear/coordinar el favorito del titular para evitar dos incrementos concurrentes con claves diferentes. Un favorito ausente nunca causa una nueva adición: propuesta `409 CART_CONFLICT`, sin mutación. Frontend conservará la intención hasta refrescar/comprobar el resultado.
4. Resolver proyección autorizada del SKU simple; jamás usar productId como SKU. Si requiere variante, `422` antes de mutar.
5. Validar condiciones comerciales con el módulo de carrito, integrando los gates I-01/G-SKU. No interpretar el límite técnico 99 como stock publicado.
6. Compartir una transacción Prisma para mutación del carrito, eliminación del favorito y registro del resultado idempotente. Adaptar el servicio de carrito para aceptar el contexto transaccional; no encadenar transacciones independientes con riesgo de éxito parcial.
7. Confirmar el snapshot. Si falla la operación, no incrementar cantidad ni retirar favorito.

Idempotencia solicitada (ampliación explícita de la SPEC, no existente hoy):

- `Idempotency-Key`: UUID v4 obligatorio en movimiento.
- Mismo titular/clave/producto: mismo resultado, sin nueva mutación, incluso tras timeout o reinicio. Persistencia durable y unicidad; detallar migración en entrega.
- Clave ligada a otro producto: `409 IDEMPOTENCY_CONFLICT`, sin mutación.
- Operación en curso: esperar resultado o `409 OPERATION_IN_PROGRESS`; cliente vuelve a comprobar con la misma clave.
- Conservar resultados al menos 24 horas y documentar expiración. No borrar el registro de una operación en curso por TTL.
- Diferentes titulares pueden usar la misma clave sin compartir resultados.
- Frontend no reintenta mutaciones automáticamente. Tras resultado incierto mantiene la tarjeta y la clave en memoria; el usuario puede comprobar el mismo intento. La clave no se guarda en localStorage. Una nueva lectura no prueba por sí sola un movimiento exitoso.

## Errores públicos

Formato `{code,message}` con texto público, sin token, customerId, stack ni cuerpos externos. Frontend usa mensajes locales.

| HTTP / code | Comportamiento |
|---|---|
| `401 UNAUTHORIZED` | Limpiar datos privados y pedir sesión; no conservar tarjeta anterior accesible. |
| `503 CATALOG_UNAVAILABLE` | Error de consulta con reintento, nunca falso vacío. |
| `503 COMMERCE_DATA_UNAVAILABLE` | No confirmar movimiento; favorito permanece. |
| `409 STOCK_LIMIT_REACHED` | Favorito permanece; deshabilitar compra y marcar sin existencias. |
| `409 CART_CONFLICT` | Sin movimiento confirmado; revisar contexto. |
| `422 VARIANT_SELECTION_REQUIRED` | Incluir `redirectUrl: "/productos/slug-valido"`; favorito permanece. No SKU/talla arbitrarios. |
| `404 PRODUCT_NOT_AVAILABLE` | Producto inactivo/retirado; conservar intención, permitir quitar. |
| `409 IDEMPOTENCY_CONFLICT` | No reintentar como operación nueva. |
| `409 OPERATION_IN_PROGRESS` | Permitir comprobar con la clave original. |
| `400 INVALID_PRODUCT_ID` / `INVALID_REQUEST` | Rechazo sin mutación. |

`redirectUrl` solo ruta interna `/productos/{slug}`, sin esquema, dominio, query ni hash. Frontend no crea ficha ni carrito en esta entrega; navegación habilitable cuando sus responsables entreguen rutas reales.

## Deshacer F-038/O-006

Eliminación optimista visual, rollback aislado ante rechazo confirmado. Si se pierde respuesta, frontend conserva la incertidumbre y repite el DELETE idempotente para confirmar antes de ofrecer Deshacer. Nunca enviar POST de restauración mientras DELETE siga pendiente.

Tras `204`, aviso de 5 segundos de tiempo disponible, pausado por foco/hover. Restaurar con POST F-036; `201/200` confirma guardado, `404` por inactivo no se presenta como éxito. Después se relee GET para obtener orden/fecha autoritativos. No se promete fecha o posición histórica. Stock de una talla no determina por sí solo elegibilidad del favorito. Esta estrategia es una decisión local del usuario; registrar revisión de G-UNDO sin declarar su homologación automáticamente.

## Fixtures y matriz de aceptación de backend

Entregar al menos: cliente A/B; producto simple vendible; producto con variantes; agotado; retirado; catálogo caído; favorito ausente; rechazo de carrito; token inválido/vencido. Los escenarios de frontend son simulaciones independientes, no fixtures persistidos ni aceptación de integración.

- [ ] GET filtra por titular, ordena y distingue vacío/retirado/503.
- [ ] POST repetido no duplica ni modifica fecha; DELETE repetido responde 204 sin afectar ajenos.
- [ ] Mover produce una sola mutación de carrito y retira favorito únicamente después de éxito.
- [ ] Error de carrito revierte ambos recursos; 422 no elige SKU y conserva favorito.
- [ ] Timeout tras commit + replay devuelve mismo snapshot y cantidades.
- [ ] Replay concurrente, reinicio y conflicto de clave probados con PostgreSQL.
- [ ] Dos claves diferentes compitiendo por el mismo favorito no agregan dos veces.
- [ ] Restauración de activo/inactivo, aislamiento A/B y sesión vencida probados.
- [ ] Guards de carrito/favoritos usan el mismo principal validado.
- [ ] OpenAPI actualizado, ejemplos exactos y migraciones documentadas, sin reset de base de desarrollo.

## Activación y entrega

En Next, flags server-only inicialmente false:

```dotenv
H3_WISHLIST_READ_ENABLED=false
H3_WISHLIST_MOVE_ENABLED=false
```

Activar lectura después de verificar GET/DTO. Activar movimiento solo después de verificar atomicidad e idempotencia durable. Requiere además la sesión sandbox explícita de H3; no es auth de producción. Las rutas devuelven indisponibilidad explícita mientras estén deshabilitadas.

Backend debe devolver: rama/commit, OpenAPI, versión de DTO, comandos de prueba y fixtures, decisión de idempotencia/migración/retención, errores de favorito ausente, evidencia A/B y validación de gates. Después frontend ejecuta E2E conectado sin interceptar HTTP, consulta PostgreSQL de prueba y documenta limitaciones restantes.

No se incluye código backend en esta entrega. No se crean ni publican commits automáticamente. La copia en Backend de este documento es el encargo de trabajo; los cambios de contrato deben acordarse antes de activar flags.
