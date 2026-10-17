# Integración G6 — preparación y ejecución F-006/F-007

Corte: 17/10/2026. Responsable: Giuliano; revisión del adaptador/contrato: Leonidas. El alcance se limita a categorías y búsqueda de H3. No incorpora precio, stock, checkout ni detalle F-011.

## Fuente y estado

- [OpenAPI candidato 0.6.0-rc.1](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b/contratos/http/openapi.yaml), blob Git `f64bfe9a097b2a0f74c2600988305443d92f640e`.
- [Acuerdo propuesto G1/G6](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b/integraciones/ALINEACION_MARKETPLACE.md).
- Backend G6 consultado: `9866ff26a8ff542b802ae39775db2e0326c623fb`. El módulo comercial sigue inyectando `PendingCommercialEligibility`, que devuelve 503. El owner debe resolver su fuente autoritativa; G1 no decide qué productos son elegibles.
- Comprobación pública 17/10/2026, 01:25 Lima: ambas rutas devolvieron 503 de Caddy, texto «Servicio pendiente: API Gateway G6 aún no está desplegado.». Se usó TLS normal y ningún token.

Las pruebas locales siguientes acreditan transporte HTTP y adaptación con datos sintéticos. No acreditan despliegue G6, autenticación G7, grants, homologación bilateral ni aceptación H3.

## Frontera implementada

El navegador llama a Next; Next consulta NestJS y sólo NestJS envía la credencial técnica a G6. No se accede a la base de datos de otro grupo ni se replica su catálogo.

| BFF de G1 | G6 | Mapeo |
|---|---|---|
| `GET /api/v1/catalog/home` | `GET /api/v1/categorias` | `categories`, sólo `status=ACTIVA`, sin inventar destacados |
| `GET /api/v1/catalog/products` | `GET /api/v1/productos?canal=MARKETPLACE` | `q`; `pagina=page+1`; `tamanio=pageSize`; `categoriaId`; `NOMBRE_ASC/DESC` |
| Correlación | `X-Correlation-Id` | Mismo UUID que G1 devuelve como `X-Request-Id` |
| Tarjeta | `ProductoResumenComercial` | Identidad/nombre/categoría/marca; `images` omitido o vacío → `image:null` |

Una imagen informada exige HTTPS y hostname permitido. 401/403 del token técnico, 429, 503, timeout o respuesta inválida producen un error recuperable del catálogo, nunca un listado vacío ni un fallback silencioso a MOCK. Un 401 de G6 no cierra la sesión del visitante.

## Configuración privada necesaria

Añadir al `.env` existente de Backend los valores acordados, sin reemplazar su configuración propia. `.env` está ignorado por Git y excluido de las imágenes. La URL comunicada por G6 es un origen, sin `/api/v1` al final.

```dotenv
PRODUCTOS_BASE_URL=https://g6-productos-ofertas.duckdns.org
PRODUCTOS_CONTRACT_VERSION=0.6.0-rc.1
PRODUCTOS_CONTRACT_SHA=f64bfe9a097b2a0f74c2600988305443d92f640e
PRODUCTOS_TIMEOUT_MS=5000
```

Completar por canal privado `PRODUCTOS_SERVICE_TOKEN` con una credencial efectiva y `PRODUCTOS_MEDIA_HOSTS` con los hostnames de medios confirmados (separados por coma, sin esquema/ruta ni comodines). Puede estar vacío si todos los productos carecen de imagen; no admite imágenes de cualquier origen. Registrar la homologación correspondiente antes de poner `CATALOG_INTEGRATION_APPROVED=true`; la bandera no concede permisos ni certifica un acuerdo.

G6/G7 deben confirmar audiencia `api-productos`, scope `catalogo:leer`, tipo de servicio e identidad propuesta `modulo-marketplace`. El Gateway actual compara `sub` con su allowlist: contrastar el token emitido y el acuerdo real. Acordar también cómo obtenerlo/renovarlo. El adaptador actual usa un token configurado: no implementa adquisición ni renovación automática y no inventa un endpoint OAuth. Una credencial vencida exige su sustitución y recreación del Backend.

## Ensayo local independiente de G6

```powershell
npm run test:g6:contract
```

La suite arranca un proveedor HTTP sólo en `127.0.0.1` y utiliza `CatalogModule` con su factory y adaptador reales, sin sustituir `fetch` ni `CATALOG_PROVIDER`. No carga `.env`, no inicia PostgreSQL ni aplica migraciones. Usa un token estático sintético para verificar transporte de la cabecera; no simula una concesión real de G7.

Cubre categorías, token de servidor distinto al del navegador, correlación, segunda página, DTO público, imágenes opcionales, vacío, errores 401/403/429/503, respuesta Caddy, timeout, rechazo de redirecciones, validación previa y medios no autorizados. `X-Catalog-Source: REAL` identifica que se ejecutó el adaptador; en esta suite el upstream sigue siendo un servidor local sintético.

## Activar la conexión cuando G6 esté listo

La configuración base de [Docker H3](DOCKER-H3.md) continúa explícitamente en MOCK. Para usar el entorno aprobado, combinar ambos archivos desde Backend:

```powershell
docker compose -f compose.h3.yaml -f compose.h3.g6.yaml config --quiet
docker compose -f compose.h3.yaml -f compose.h3.g6.yaml up --detach --wait --wait-timeout 180
npm run check:g6
npm run check:g6 -- --via-web --base-url http://127.0.0.1:3000
```

Si las imágenes aún no están construidas, añadir `--build` al comando `up`. El override cambia únicamente `CATALOG_SOURCE=real`; el resto proviene del `.env` privado y del Compose base. No crea servicios G6 ni altera volúmenes, BD, guards o identidades de otros bloques. No establecer `USE_MOCKS=false` globalmente para esta integración: pertenece a otros adaptadores del baseline.

El comando `check:g6` no lee `.env` ni maneja el token: consulta anónimamente nuestro BFF. Comprueba home, productos y validación de consulta, exige fuente REAL, no-store y correlación en la ruta BFF. El proxy Next actual no reenvía `X-Request-Id`; para el enlace con G6 usar la comprobación directa al BFF y los logs sanitizados. Se pueden pasar `--base-url https://HOST_G1_APROBADO` y `--query zapatillas` para el entorno/búsqueda elegidos.

Salida: `PASS_READS` (código 0), `PARTIAL_NO_DATA` (código 2 si falta categoría o producto) o `FAIL` (código 1). Sólo muestra conteos, IDs de correlación y códigos seguros; no cuerpos, nombres de productos, consultas, URLs privadas ni credenciales. Un PASS necesita asociarse a la configuración del upstream aprobado y a la traza correspondiente para acreditar que respondió G6. No publica ni acepta el hito automáticamente.

La readiness del Backend comprueba PostgreSQL, no el catálogo: un contenedor healthy no implica que G6 funcione. Una lista vacía válida no es un error, pero tampoco acredita el caso positivo con productos.

## Evidencia final y vuelta al entorno de demostración

Registrar fecha, versiones desplegadas de G1/G6, entorno, contrato, búsqueda/resultado positivo autorizado, vacío y errores, y correlación BFF/G6 sanitizada. Capturar navegador sin sesión y anotar fuente REAL. No guardar Authorization ni un HAR completo con credenciales. Las capturas MOCK anteriores conservan su etiqueta.

Para volver al entorno habitual, ejecutar el Compose base, sin el override:

```powershell
docker compose -f compose.h3.yaml up --detach --wait --wait-timeout 180
node scripts/check-docker-h3.mjs
```

Se conserva el volumen. No usar `down -v`. La configuración REAL está preparada; el despliegue y acceso efectivos siguen siendo dependencias de G6/G7 y del equipo.
