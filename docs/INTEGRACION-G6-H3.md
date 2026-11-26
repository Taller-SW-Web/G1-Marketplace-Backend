# Integración G6 — F-006/F-007 en H3

Actualización: 17/10/2026. Alcance: Inicio/categorías y búsqueda. No incorpora precio, stock, checkout ni detalle F-011.

## Estado comprobado y fuentes

- [Contrato OpenAPI 0.6.0-rc.1](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b/contratos/http/openapi.yaml), blob Git `f64bfe9a097b2a0f74c2600988305443d92f640e`.
- [Gateway demo sin JWT, PR G6 #130 integrado](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/pull/130). Backend G6 consultado: `2970df90babf2c8caa1849b179b02918fc74a005`.
- Prueba pública del 17/10/2026 a las 07:33 Lima, con TLS verificado y sin token: `/api/v1/categorias` devuelve 200 y ocho categorías activas. Listado, búsqueda y detalle de productos devuelven 503 de Caddy. Es un corte temporal: repetir antes de exponer.
- [Catálogo G6, PR #125](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/pull/125), abierto en ese corte. No se infiere despliegue a partir del estado de un PR.

La conexión real de categorías puede verificarse por separado. El 503 de productos debe seguir mostrándose como error con reintento; no sustituirlo por un listado MOCK o vacío. La demo sin JWT no acredita integración de Seguridad/G7 ni cierre completo de H3.

## Frontera y autenticación

El navegador llama a Next; Next llama a NestJS; sólo NestJS llama al origen G6. No se consulta la BD de otro grupo. No se reenvían cookies o identidad del visitante a G6.

| BFF de G1 | G6 | Mapeo |
|---|---|---|
| `GET /api/v1/catalog/home` | `GET /api/v1/categorias` | Sólo `status=ACTIVA`; `categoria_id` → `categoryId`; sin inventar destacados |
| `GET /api/v1/catalog/products` | `GET /api/v1/productos?canal=MARKETPLACE` | `q`; `pagina=page+1`; `tamanio=pageSize`; `categoriaId`; `NOMBRE_ASC/DESC` |
| Correlación | `X-Correlation-Id` | Mismo UUID que G1 devuelve como `X-Request-Id` |
| Tarjeta | `ProductoResumenComercial` | Campos públicos; imagen ausente/vacía → `image:null`; imagen presente exige HTTPS y host permitido |

`PRODUCTOS_AUTH_MODE` se configura sólo en Backend:

| Valor | Comportamiento |
|---|---|
| `service-token` (predeterminado) | Requiere `PRODUCTOS_SERVICE_TOKEN`; añade `Authorization: Bearer ...` |
| `demo-no-auth` | Opción explícita para la demo temporal anunciada por G6. No necesita token y omite Authorization, incluso si quedó una credencial antigua configurada |

Un modo desconocido se rechaza. Ambos modos mantienen origen HTTPS, revisión contractual fijada, configuración explícita `CATALOG_INTEGRATION_APPROVED=true`, timeout, correlación y validación del DTO. Esta bandera habilita la prueba acordada; no certifica homologación bilateral ni grants.

401/403, 429, 503, timeout o JSON inválido producen `CATALOG_UNAVAILABLE` con 503. El diagnóstico sanitizado `PROVIDER_HTTP_503` distingue una respuesta externa de un error de configuración. Los errores de proveedor nunca cierran la sesión del visitante ni activan un fallback.

## Demo conectada a G6: localhost:3300

Requiere Docker Desktop y Compose 2.24.4 o posterior por `!override`. Backend y Frontend deben estar en carpetas hermanas. Desde Backend:

```powershell
docker compose -p g1-marketplace-h3-g6-demo -f compose.h3.yaml -f compose.h3.g6-demo.yaml config --quiet
docker compose -p g1-marketplace-h3-g6-demo -f compose.h3.yaml -f compose.h3.g6-demo.yaml up --build --detach --wait --wait-timeout 180
npm run check:g6 -- --home-only --base-url http://127.0.0.1:10300
npm run check:g6 -- --home-only --via-web --base-url http://127.0.0.1:3300
```

Abrir `http://localhost:3300/`. El override ya contiene los datos públicos del entorno acordado: origen G6 sin `/api/v1`, contrato fijado, `CATALOG_SOURCE=real` y `PRODUCTOS_AUTH_MODE=demo-no-auth`. No se necesita editar `.env` ni inventar un token. Se conserva `USE_MOCKS` de los otros adaptadores.

Este proyecto usa su propia red/volumen y los puertos 3300/10300. La demo habitual puede seguir en 3000/10000 con `compose.h3.yaml`. El `.env` privado permanece ignorado y excluido de las imágenes; el override demo vacía expresamente el token de Productos.

En Inicio, Network debe mostrar `/api/catalog/home`, 200, `X-Catalog-Source: REAL`, `X-Request-Id` y JSON de categorías. Después, ir a `/catalogo?q=zapatillas`: si productos conserva el 503 público, la web debe mostrar error con Reintentar y la petición `/api/catalog/products` debe devolver 503 REAL. Una fuente REAL indica ejecución del adaptador; asociarla a la configuración pública de este proyecto y las trazas, no sólo a la cabecera.

`check:g6 --home-only` devuelve `PASS_CATEGORIES` (0) o `PARTIAL_NO_DATA` (2). Sólo verifica Inicio; no afirma haber validado búsqueda/productos. El comando completo conserva su exigencia de respuestas positivas para home/productos/validación:

```powershell
npm run check:g6 -- --via-web --base-url http://127.0.0.1:3300 --query zapatillas
```

Mientras productos devuelva 503, el comprobador completo termina en `FAIL / CHECK_HTTP_503` (1). Esa salida es esperada para ese estado del proveedor y no se declara PASS de la integración completa.

Para logs sanitizados:

```powershell
docker compose -p g1-marketplace-h3-g6-demo -f compose.h3.yaml -f compose.h3.g6-demo.yaml logs --since 5m --no-log-prefix backend |
  Select-String '"event":"catalog_(read|error)"'
```

Localizar el mismo `X-Request-Id` mostrado en Network. No imprimir `.env`, tokens, cookies ni la salida completa de `docker compose config`. La readiness comprueba PostgreSQL y no acredita disponibilidad del catálogo.

Para detener sólo esta demo, conservando el volumen:

```powershell
docker compose -p g1-marketplace-h3-g6-demo -f compose.h3.yaml -f compose.h3.g6-demo.yaml down
```

## Volver a autenticación de servicio

Cuando se acuerde la operación autenticada, usar `PRODUCTOS_AUTH_MODE=service-token` y configurar por canal privado un token válido, audiencia `api-productos`, scope `catalogo:leer`, identidad/grant acordados con G6/G7 y su renovación. El adaptador utiliza una credencial configurada; no obtiene ni renueva JWT automáticamente.

El override `compose.h3.g6.yaml` sigue disponible para activar REAL en el stack habitual, tomando las demás variables del `.env`. Su origen debe ser sólo `https://g6-productos-ofertas.duckdns.org`, sin añadir rutas. Mantener `PRODUCTOS_CONTRACT_VERSION=0.6.0-rc.1` y `PRODUCTOS_CONTRACT_SHA=f64bfe9a097b2a0f74c2600988305443d92f640e` hasta revisar un cambio contractual. `PRODUCTOS_MEDIA_HOSTS` debe contener hostnames confirmados sin comodines; puede estar vacío mientras no se reciban imágenes.

## Pruebas y evidencia

```powershell
npm run test:g6:contract
npm run test:g6:probe
npm run test:unit -- --runTestsByPath src/catalog/catalog.spec.ts
npm run typecheck
```

Las suites HTTP usan servidores aislados en loopback y no cargan `.env`. Comprueban los dos modos de autenticación, no filtrado de identidad del visitante, correlación, categorías, mapeos, imágenes opcionales, errores y timeout. La prueba de demo reproduce categorías 200/productos 503 y valida el CLI de categorías. Estos fixtures no sustituyen la comprobación pública ni el recorrido conectado de navegador.

Registrar fecha/hora, commits de G1, entorno/proyecto, contrato, rutas, fuente, IDs de correlación y alcance. Las capturas MOCK anteriores conservan su etiqueta; las nuevas deben distinguir categorías REAL, productos con error y pruebas sintéticas. No acreditar búsqueda positiva, autenticación G7, despliegue público de G1 ni aceptación H3 con el éxito parcial de categorías.
