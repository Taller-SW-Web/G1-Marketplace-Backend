# Catálogo G6: `public-read-only` opt-in

Ampliación de BE #273 (modo público existente), ya integrado en develop junto con #274 (client_credentials). Se conserva esa entrega y se añade F-011 por separado. Este modo **no es el default**, no obtiene tokens, no altera la autorización de G6 ni configura Render. `service-token` sigue siendo el default; `client-credentials` permanece opt-in y ahora también funciona en F011.

## Activación explícita

El host Supabase y el presupuesto de 15 s del ejemplo corresponden exclusivamente al ensayo local autorizado. Para un entorno compartido/producción deben confirmarse los medios y el presupuesto con sus responsables; esta PR no aprueba ni aplica esos valores en Render.

```dotenv
CATALOG_SOURCE=real
BFF_MODE=real
CATALOG_INTEGRATION_APPROVED=true
PRODUCTOS_AUTH_MODE=public-read-only
PRODUCTOS_BASE_URL=https://g6-productos-ofertas.duckdns.org
PRODUCTOS_SERVICE_TOKEN=
PRODUCTOS_CONTRACT_VERSION=0.6.0-rc.1
PRODUCTOS_CONTRACT_SHA=f64bfe9a097b2a0f74c2600988305443d92f640e
PRODUCTOS_MEDIA_HOSTS=slzglmtiyrzygpkiuthf.supabase.co
PRODUCTOS_TIMEOUT_MS=15000
```

Las tres primeras variables impiden combinar este modo con fixtures de ficha. Configuración incompleta falla cerrada. El default sigue siendo `service-token`, que exige su credencial; `demo-no-auth` conserva la restricción que impide usarlo con NODE_ENV=production. El nuevo modo admite configuración de producción únicamente de forma explícita; esta PR **no autoriza ni ejecuta su despliegue**.

`public-read-only` no envía Authorization aunque haya un token residual configurado, ni reenvía la cookie/JWT del visitante. Cada llamada usa método GET explícito, `redirect: error`, `cache: no-store`, timeout y correlación UUID. No cambia de modo, no reintenta autenticado y no devuelve fixtures cuando falla el proveedor, el contrato, TLS o la configuración.

## Compatibilidad con los modos autenticados

Home/listado/maestros y la ficha F011 utilizan la misma política `g6-auth.ts` y el proveedor de tokens de #274:

| Modo | Autorización saliente |
| --- | --- |
| `service-token` (default) | Bearer estático de servidor; no llama a G7 |
| `client-credentials` (opt-in) | Obtiene el token de G7 y envía su Bearer; ignora un token estático residual |
| `public-read-only` (opt-in) | Ninguna; ignora tanto token estático como URL/secreto G7 |
| `demo-no-auth` | Ninguna, únicamente fuera de producción |

Para F011 autenticada se necesitan igualmente `CATALOG_SOURCE=real`, `BFF_MODE=real`, aprobación y pin contractual. Seleccionar client-credentials con flags inconsistentes falla cerrado: no sirve una ficha de fixture. Además requiere `G7_TOKEN_URL` HTTPS con ruta `/api/v1/auth/token` y `PRODUCTOS_CLIENT_SECRET` por el canal protegido de servidor. No se solicita ni registra el secreto en GitHub.

F011 conserva un cliente por instancia de servicio y configuración efectiva. Así comparte una emisión en consultas concurrentes, reutiliza el token vigente y permite la renovación anticipada de #274 entre consultas. Si cambia el modo/origen/pin/medios/presupuesto/secreto se reconstruye el cliente; una configuración nueva inválida no reutiliza credenciales anteriores. Home y F011 mantienen sus clientes/cachés independientes dentro del proceso; no se persisten tokens ni se comparte una caché de respuestas de catálogo.

Un fallo de G7 se traduce al error seguro de F011 sin probar token estático, público o MOCK. Esto integra el código del consumidor, no demuestra un grant real ni una emisión G7 en producción. Las pruebas nuevas usan dos orígenes HTTP locales para verificar que el secreto sólo va al emisor y el token emitido sólo a G6, sin credenciales del visitante.

## Lista exacta del consumidor G1

| GET permitido | Parámetros permitidos |
| --- | --- |
| `/api/v1/categorias` | Sin query |
| `/api/v1/marcas` | Sin query |
| `/api/v1/productos` | `canal=MARKETPLACE`; opcionales `pagina`, `tamanio`, `q`, `categoriaId`, `marcaId`, `precioMin`, `precioMax`, `orden` |
| `/api/v1/productos/{productoId}` | ID UUID y sólo `canal=MARKETPLACE` |
| `/api/v1/productos/por-slug/{slug}` | Slug canónico de 1–120 caracteres y sólo `canal=MARKETPLACE` |

Se rechazan rutas administrativas/internas, otros métodos, parámetros desconocidos/duplicados, otros canales y cambio de origen antes de hacer una llamada. No se autorizan automáticamente todos los GET ni se incluyen Pricing, Inventory, promociones, recomendaciones o POST de evaluación. Esta es la lista del consumidor G1 para el alcance solicitado, **no una afirmación de grants o publicación aprobada por G6**.

## Marcas y detalle REAL incluidos

- `GET /api/v1/catalog/filters` consulta categorías y marcas de G6, valida ambos maestros y sólo publica marcas activas sin campos internos. Un fallo de marcas mantiene 503; no devuelve una lista falsa. Este camino ya existía para el proveedor REAL y ahora queda cubierto por las pruebas del modo público.
- `GET /api/v1/catalog/products/{slug}` consume el detalle por slug de G6 y responde con `meta.source=REAL`. Proyecta identidad, marca, descripción, galería y especificaciones con valores primitivos legibles. Los atributos cuyo valor sólo es `{valor_id}` se omiten: el ID no se muestra como valor ni se inventa un texto. No hace consultas extra fuera de la lista para resolverlos.
- Cada imagen debe ser HTTPS y pertenecer a un host exacto permitido. No se admiten credenciales en URLs ni imágenes duplicadas. El contrato F-011 existente exige al menos una imagen: una respuesta sin imágenes da 502 hasta acordar una evolución explícita; no se reemplaza con una foto de un fixture.
- Producto ausente/no publicable confirmado → 404; payload inválido/JSON inválido → 502; red, TLS, configuración o proveedor indisponible → 503; timeout → 504. No se expone el token ni el cuerpo de error del upstream.
- Precio/oferta, variantes comerciales, disponibilidad y recomendaciones F-012–F-015 conservan sus adaptadores pendientes. Incluir F-011 no completa esa ficha comercial ni habilita compra. El camino MOCK sigue existiendo sólo cuando se selecciona explícitamente, separado del catálogo REAL.

## Ensayo local sin modificar producción

Clonar Backend y Frontend como directorios hermanos, instalar con `npm ci` y construir ambos. Usar la rama de esta PR en Backend y develop en Frontend. En una terminal PowerShell del Backend:

```powershell
$env:NODE_ENV='test'
$env:PORT='10660'
$env:CATALOG_SOURCE='real'
$env:BFF_MODE='real'
$env:CATALOG_INTEGRATION_APPROVED='true'
$env:PRODUCTOS_AUTH_MODE='public-read-only'
$env:PRODUCTOS_BASE_URL='https://g6-productos-ofertas.duckdns.org'
$env:PRODUCTOS_SERVICE_TOKEN=''
$env:PRODUCTOS_CONTRACT_VERSION='0.6.0-rc.1'
$env:PRODUCTOS_CONTRACT_SHA='f64bfe9a097b2a0f74c2600988305443d92f640e'
$env:PRODUCTOS_MEDIA_HOSTS='slzglmtiyrzygpkiuthf.supabase.co'
$env:PRODUCTOS_TIMEOUT_MS='15000'
$env:CATALOG_FEATURED_ENABLED='false'
$env:CATALOG_HOME_FALLBACK_ENABLED='false'
$env:AUTH_ENABLED='false'
$env:USE_MOCKS='true'
$env:ORDERS_SOURCE='unconfigured'
$env:H3_SANDBOX_ENABLED='false'
$env:H3_AUTH_MOCK='false'
$env:DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/public_catalog_readonly'
npm run build
npm run start:prod
```

La URL PostgreSQL es sintética y no hay migraciones ni escrituras de BD. `USE_MOCKS` aísla otros módulos de este proceso local, no reemplaza los datos del catálogo seleccionado REAL. No usar carrito/checkout ni interpretar `/live` como prueba de BD.

En otra terminal PowerShell del Frontend:

```powershell
$env:NODE_ENV='production'
$env:MARKETPLACE_API_URL='http://127.0.0.1:10660'
$env:CATALOG_BFF_TIMEOUT_MS='18000'
$env:G1_AUTH_ENABLED='false'
$env:H3_FRONTEND_SANDBOX_ENABLED='false'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3560
```

Abrir <http://127.0.0.1:3560/catalogo?q=Nike&pageSize=4&sort=NAME_ASC>, comprobar `X-Catalog-Source: REAL`, imágenes y navegación a la ficha del producto real. Si G6 vuelve a fallar en marcas/precio, el error se conserva; esas operaciones necesitan retest del dueño.

## Pruebas y revisión

`src/catalog/public-read-only.spec.ts` verifica opt-in, modos previos, ausencia de credenciales, allowlist/métodos/canales/querys, marcas activas y proyección/errores de ficha. `test/catalog-public-read-only.e2e-spec.ts` usa un upstream HTTP controlado para comprobar las rutas BFF, correlación, cookies/Authorization entrantes, fallos y ausencia de mutaciones. Estas pruebas no certifican G6 en vivo ni un grant.

Para repetir: `npm run test:unit` y `npm run test:e2e`. El ensayo con G6 vivo se registra por separado, con sus límites, en la PR. El contrato sigue fijado a rc1; no se promueve automáticamente la documentación candidata rc3.

El host Supabase sigue limitado al ensayo local mientras no llegue la confirmación solicitada a G6. La coordinación de token/grants con Leónidas continúa. No se cambia NODE_ENV de Render ni se retiran las guardas de MOCK o TLS. El diagnóstico de red y el ensayo desde GitHub están en [Frontend #132](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/132).


## Ensayo del 05/11/2026

Con G6 público vivo y el Backend compilado de esta propuesta: categorías 200 REAL (8), listado Nike 200 REAL (4), ficha `nike-academy-hv4386-100` 200 REAL con marca/descripcion/imagen del proveedor. Navegación Edge tarjeta→ficha y decodificación de imagen 700×700 PASS, sin interceptar HTTP ni sustituir datos. Atributos sólo con IDs se omitieron y la ficha publicó cero especificaciones legibles.

La consulta de filtros conservó 503 de marcas; no se atribuye disponibilidad del proveedor a esa operación. Su conexión y validación se prueban con upstream HTTP controlado. El ensayo es local y sin JWT; no acredita grant, revisión independiente ni despliegue. F-012–F-015 muestran sus errores de integración y no se presenta compra habilitada.

Actualización de compatibilidad: #274 y #273 ya están integradas en develop v1.6.0. Esta ampliación incorpora ese develop y reutiliza el proveedor de credenciales de Leónidas también para F011, mediante la política compartida descrita arriba. No se simula un token vacío ni se cambia automáticamente a público.

El ensayo original basado en #273 tuvo 504 pruebas unitarias y 345 HTTP PASS. La navegación de Edge documentada arriba corresponde a ese ensayo; no se repitió como prueba del despliegue de develop v1.6.0.

Validación local del conjunto compatible con develop v1.6.0: 532 pruebas unitarias y 352 HTTP PASS; 22 casos dependientes de BD se omitieron, no se atribuyen como ejecutados. Tipos/build, 4 pruebas del servidor de autenticación simulado, 6 del probe, 4 del inspector de configuración y cinco OpenAPI PASS. Las pruebas nuevas comprueban los tres modos de acceso en Home, filtros, búsqueda y ficha, además de caché/renovación de tokens y rechazo seguro de configuraciones o emisión inválidas. G7/G6 se controlan localmente: estos resultados no acreditan grants ni disponibilidad externa.
