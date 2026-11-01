# Catálogo H3 — F-006/F-007 — Giuliano

Catálogo portado al baseline NestJS de `origin/develop`, commit `ed9582e55da30007620d5740f9e4c80d41d5ad8b`, por instrucción de Giuliano del 15/10/2026. Se conserva la arquitectura compartida: bootstrap, configuración, Prisma, health, scripts, dependencias, lockfile, Jest y Render. La implementación propia se incorpora mediante CatalogModule; no existe un segundo servidor HTTP.

El modo MOCK acredita avance local y regresiones, no integración real con Productos, despliegue ni cierre de H3. No incorpora funcionalidad H4 ni cambios de base de datos.

## Ejecutar localmente

Utilizar Node.js 22.18 o posterior dentro del rango del baseline (`>=22 <25`). Instalar y preparar la configuración:

```powershell
npm ci
# Copiar sólo si todavía no existe .env; conservar la configuración local propia.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
$env:CATALOG_SOURCE = 'mock'
npm run build
npm run start:prod
```

También se puede usar `npm run start:dev`. El baseline requiere un DATABASE_URL PostgreSQL válido al arrancar, incluso en MOCK. Las lecturas de catálogo no consultan la BD, por lo que no hace falta tener PostgreSQL disponible para probarlas. `/live` comprueba el proceso; `/`, `/health` y `/ready` conservan readiness y responden 503 si la BD falla. No se simula un health exitoso.

El puerto predeterminado es 10000, configurable por PORT; el bootstrap compartido escucha en `0.0.0.0`. CORS utiliza **CORS_ORIGINS**, con varios orígenes separados por coma. Ya no se utiliza CORS_ORIGIN ni HOST del servidor anterior.

```powershell
npm run build
npm run lint
npm test
npm run test:e2e
npm run prisma:validate
```

Build genera Prisma Client y compila a `dist/main.js`; no aplica migraciones. El arranque Render del baseline sí conserva `prisma migrate deploy`, cuya operación corresponde al despliegue aprobado. Las pruebas usan Jest/SWC y Supertest; no llaman a G6 real. No ejecutar `node src/server.js` ni `node --test`.

## Contrato público conservado

- `GET /api/v1/catalog/home`: categorías activas y destacados vacíos mientras G-FEATURED esté pendiente.
- `GET /api/v1/catalog/products?q=running&page=0&pageSize=24`: normalización y límites 2–120 caracteres; vacío equivale a catálogo. Página desde cero y tamaño 1–48.
- `categoryIds` admite un ID; `sort` sólo NAME_ASC/DESC para el adaptador, sin panel/selector H4 en la UI.
- Parámetros desconocidos, duplicados, administrativos o inválidos se rechazan antes de invocar al proveedor. Se analiza la URL original para conservar esta protección; el ValidationPipe global del baseline permanece intacto.
- DTO de tarjeta: `productId`, `slug`, `name`, `categoryId`, `brandId`, `image`. No inventa precio, nombre de marca, stock ni SKU.
- Cabeceras: X-Catalog-Source, X-Request-Id, Cache-Control no-store y X-Content-Type-Options nosniff. El middleware conserva un X-Request-Id seguro o genera un UUID; el interceptor reutiliza ese ID y sólo registra códigos, ruta, duración y hash de búsqueda.
- Errores del catálogo: `application/problem+json` con `type`, `title`, `status`, `code`, `requestId`. Un fallo técnico de G6 se convierte en 503, sin vacíos falsos ni cierre de sesión del visitante. POST a las rutas de lectura devuelve 405.
- Las rutas inexistentes conservan el NotFoundFilter compartido y su `{error: "Ruta no encontrada"}`.

CORS respeta el baseline: el origen permitido recibe su cabecera; el origen no permitido no recibe concesión CORS. Esto no equivale a una respuesta HTTP 403 ni sustituye autorización. Las rutas públicas siguen siendo públicas y el navegador aplica la política; no se reinstala el rechazo de origen del handler anterior.

## Adaptador de Productos

Se mantiene el candidato [OpenAPI G6](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/master/contratos/http/openapi.yaml) `0.6.0-rc.1`, blob `f64bfe9a097b2a0f74c2600988305443d92f640e`, consultado inicialmente el 14/10/2026. La migración no homologa otra revisión ni habilita una llamada real. Véase [alineación Marketplace](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/master/integraciones/ALINEACION_MARKETPLACE.md).

| Marketplace | G6 |
|---|---|
| Home | `/api/v1/categorias`, sólo categorías ACTIVA |
| Búsqueda | `/api/v1/productos?canal=MARKETPLACE` |
| page / pageSize | pagina=page+1 / tamanio |
| categoryIds singular | categoriaId |
| NAME_ASC / NAME_DESC | NOMBRE_ASC / NOMBRE_DESC en orden |
| Correlación | X-Correlation-Id con el requestId |
| Imagen | Primera images[], HTTPS y hostname explícitamente permitido |

La proyección runtime rechaza productos contradictorios/incompletos, páginas incoherentes, imágenes inseguras, redirecciones y versiones contractuales no homologadas. Timeout aborta la llamada HTTP real. No se copia el catálogo a PostgreSQL ni se consulta la BD de otro grupo.

Para REAL se requieren los valores aprobados de CATALOG_INTEGRATION_APPROVED, PRODUCTOS_BASE_URL, PRODUCTOS_SERVICE_TOKEN, PRODUCTOS_CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA y PRODUCTOS_MEDIA_HOSTS, además de CATALOG_SOURCE=real. PRODUCTOS_TIMEOUT_MS admite 100–30000 ms; por defecto 5000. La URL base es un origen HTTPS sin ruta, credenciales, query ni fragmento; loopback HTTP se permite sólo fuera de producción para pruebas.

No subir tokens a Git ni al navegador. La bandera de aprobación por sí sola no acredita homologación. Si falta configuración se responde 503; si falla REAL nunca se cambia a fixtures. MOCK está prohibido en producción.

## Archivos y revisión

`src/catalog/` contiene CatalogModule, CatalogController, CatalogService, provider/query/errors/fixtures/types y el interceptor/filtro local. Se eliminaron `src/app.js`, `src/server.js` y sus helpers JavaScript, reemplazados por TypeScript; las pruebas Node originales se portaron a Jest/Supertest.

La [guía de elementos compartidos](ELEMENTOS-COMPARTIDOS.md) documenta imports, inyección y límites. Sebastian revisa el bloque; Leonidas revisa la adaptación a NestJS y el contrato; Andrés coordina entorno/CORS/Render. Diego/Jim verifican evidencias y aceptación. Ficha y retorno siguen en el bloque de Sebastian.

La rama publicada es `feat/s1-f006-f007-catalogo`. No se cambia main/develop ni se abren PR; Giuliano los preparará manualmente. El frontend conserva sus DTO y diseño, y sus pruebas ahora compilan/inician el Backend NestJS con configuración MOCK explícita.

## Ajuste de imagen opcional — 16/10/2026

Por solicitud de Giuliano, G6 puede omitir `images` o enviar `[]`: el adaptador conserva la tarjeta y emite `image: null`. Marketplace muestra un placeholder local, manteniendo todos los productos y metadatos de página. Una imagen proporcionada conserva las validaciones de medios; valores mal formados o inseguros mantienen 503. El contrato candidato G6 no cambia de versión/SHA y la integración REAL sigue pendiente.

## Actualización de baseline — 16/10/2026

La rama incorpora develop e6fc7f2 y conserva CartModule, configuración AUTH/USE_MOCKS, guards y bootstrap compartidos. CatalogModule convive con el carrito anónimo; existe una regresión HTTP conjunta usando servicios sintéticos. Se restaura start:prod para que el comando de Render resuelva el compilado. [Configuración de despliegue](DESPLIEGUE-H3.md); no se aplican migraciones ni se habilita G6 REAL con este cambio. Las referencias anteriores describen la migración inicial; los PR #11/#3 ya existen y permanecen draft.

## Preparacion G6 — 17/10/2026

Se incorpora un ensayo HTTP del CatalogModule y adaptador contra un servidor local del contrato G6, junto a un probe del BFF/Next y un override Docker explicito para REAL. [Configuracion, pruebas y pendientes](INTEGRACION-G6-H3.md). No cambia el DTO ni activa G6 en el entorno habitual; no acredita grants, homologacion ni despliegue.

## Integracion actual de develop — 17/10/2026

Se incorpora develop 62f077d conservando todos los modulos y validaciones compartidos. [Resoluciones y validacion de 267 casos Backend](INTEGRACION-DEVELOP-H3-2026-10-17.md). Los cortes anteriores conservan su fecha; CatalogModule convive con el detalle por slug de Sebastian.
