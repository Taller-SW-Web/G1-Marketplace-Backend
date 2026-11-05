# Catálogo G6: modo explícito `public-read-only` para H4

Cuando G6 publique lecturas sin JWT, el BFF podrá consumirlas también en producción seleccionando explícitamente `PRODUCTOS_AUTH_MODE=public-read-only`. La disponibilidad anunciada por G6 todavía requiere prueba conjunta; este cambio no certifica su despliegue ni activa configuración de producción.

El valor predeterminado sigue siendo `service-token`. `.env.example` mantiene `CATALOG_SOURCE=unconfigured` y `PRODUCTOS_AUTH_MODE=service-token`. No hay selección automática del modo público por token ausente, vencido o rechazado.

## Comportamiento y alcance

| Modo | Producción | Credenciales salientes a G6 |
| --- | --- | --- |
| `service-token` (predeterminado) | Permitido con contrato y configuración válidos | `Authorization: Bearer <PRODUCTOS_SERVICE_TOKEN>`; token obligatorio |
| `client-credentials` (opt-in, integrado desde #274) | Permitido con emisor HTTPS y secreto servidor válidos | Token obtenido de G7 y cacheado/renovado en memoria; Bearer a G6 |
| `demo-no-auth` | Prohibido | Ninguna; sólo ensayo fuera de producción |
| `public-read-only` | Permitido con contrato y configuración válidos | Ninguna, incluso si quedó un token configurado |

El transporte público usa exclusivamente `GET`, `credentials: omit`, `redirect: error` y `cache: no-store`. Construye sus propios encabezados `Accept` y `X-Correlation-Id`: no reenvía el Bearer ni las cookies del visitante y no agrega el token del servidor. El origen sigue fijado por configuración del BFF, nunca por parámetros del navegador.

La integración con develop conserva también `client-credentials`, ya incorporado por #274. Seleccionar `public-read-only` no consulta G7 ni utiliza `PRODUCTOS_CLIENT_SECRET`, aunque ambos estén configurados. Las regresiones prueban los tres modos de producción y la prohibición de demo-no-auth; no hay cambio automático entre modos. La ficha F011 por slug se integra por separado en #275.

Una lista cerrada valida el destino antes de llamar a G6:

| Operación G6 | Consumidor existente en G1 | Parámetros permitidos |
| --- | --- | --- |
| `GET /api/v1/categorias` | Home y maestros de filtros | Ninguno |
| `GET /api/v1/marcas` | Maestros de filtros | Ninguno |
| `GET /api/v1/productos` | Búsqueda, filtros, orden y paginación; muestreo existente de Home cuando corresponda | `canal=MARKETPLACE` obligatorio; opcionales `pagina`, `tamanio`, `q`, `categoriaId`, `marcaId`, `precioMin`, `precioMax`, `orden` |
| `GET /api/v1/productos/{UUID}` | Resolución de destacados de Home | Sólo `canal=MARKETPLACE` |

Se rechazan métodos distintos de GET, parámetros desconocidos o repetidos, otros canales, rutas adicionales, segmentos de ruta codificados y normalización de recorrido de directorios. No habilita escrituras, inventario, reservas, precios administrativos ni promociones. Los filtros comerciales de precio que ya existen en el listado conservan su contrato.

**F011 por slug queda pendiente:** `GET /api/v1/productos/por-slug/{slug}` forma parte del contrato comunicado por G6, pero este PR no implementa el consumidor REAL de la ficha F011. La lista cerrada de este proveedor no permite esa ruta. `BFF_MODE` y el comportamiento de `ProductDetailService` no cambian. El detalle cubierto aquí es el GET por ID que Home ya utiliza.

No cambia los DTO públicos de G1, reglas de productos elegibles, selección de destacados, ni decisiones de Home. El ranking REAL de G5 sigue necesitando su adaptador; permitir lecturas públicas de G6 no lo proporciona. Tampoco obtiene ni renueva tokens de G7.

## Preparación de configuración

Conservar los valores ya acordados para origen, contrato, imágenes y presupuestos. Ejemplo orientativo **sin secretos**, para activar sólo después de confirmar el entorno con G6:

```dotenv
NODE_ENV=production
CATALOG_SOURCE=real
CATALOG_INTEGRATION_APPROVED=true
PRODUCTOS_AUTH_MODE=public-read-only
PRODUCTOS_BASE_URL=https://g6-productos-ofertas.duckdns.org
PRODUCTOS_CONTRACT_VERSION=0.6.0-rc.1
PRODUCTOS_CONTRACT_SHA=f64bfe9a097b2a0f74c2600988305443d92f640e
# Mantener PRODUCTOS_TIMEOUT_MS según el presupuesto aprobado para el entorno.
# PRODUCTOS_MEDIA_HOSTS=<dominios de imágenes confirmados y aprobados>
```

`PRODUCTOS_CONTRACT_SHA` identifica el blob del contrato fijado, no el SHA desplegado. El modo público no elimina la aprobación explícita ni la fijación de contrato. El origen de producción debe ser HTTPS, sin credenciales, ruta adicional, query ni fragmento. Las imágenes siguen requiriendo su lista de hosts aprobados; esta propuesta no aprueba nuevos hosts ni modifica plazos.

No es necesario configurar `PRODUCTOS_SERVICE_TOKEN` en este modo. Si existe por una configuración anterior, se ignora al construir cada solicitud pública. No copiar tokens a documentación, cliente web o parámetros de URL.

## Validación y coordinación antes de activar

1. **Giuliano:** entregar PR a `develop` con pruebas y evidencia de CI. **Leónidas:** revisar el límite de lecturas, configuración y compatibilidad. El cambio se entrega para revisión; no implica aceptación ni cierre automático de issues.
2. **Responsable de G6:** confirmar URL, SHA desplegado y que categorías, marcas, listado comercial y detalle por ID responden sin JWT. Confirmar también contrato de respuestas, imágenes y datos de prueba. Su anuncio de habilitación no sustituye estas respuestas.
3. **Andrés / responsable de despliegue G1:** desplegar el commit revisado, registrar SHA efectivo del BFF y configuración sanitizada, seleccionar explícitamente `public-read-only` y conservar origen HTTPS, pins, aprobación, medios y presupuestos acordados. No cambiar a `demo-no-auth` en producción. Este PR no cambia Render ni Vercel.
4. **G1 con G6 / QA:** probar Home, filtros y búsqueda desde el BFF y desde Next, incluyendo un destacado válido por ID cuando exista una selección aprobada. Registrar hora, URL, SHA, estado, duración y correlación; comprobar que G6 no recibe Authorization ni cookies. Si no existe selección aprobada, no activar destacados sólo para pasar esta validación.
5. **G1 / QA:** comprobar que los errores siguen siendo errores correlacionados. Un 401/403/503 de G6 produce indisponibilidad segura; no se reintenta con Bearer ni se devuelve catálogo vacío o MOCK para ocultarlo. Mantener F011 REAL, ranking G5 y demás condiciones de cierre como pendientes independientes.

Tras compilar, `npm run check:catalog:config` informa `publicReadOnlySelected` sin imprimir tokens, origen ni selección editorial. Sólo comprueba el constructor local: `grantVerified`, `deployedShaVerified` y la aceptación externa no quedan certificados por sus flags.

## Reversión

Volver a `PRODUCTOS_AUTH_MODE=service-token` únicamente con un token técnico válido y el acceso G6/G7 confirmado; este modo exige token y mantiene Bearer. Si no hay un mecanismo disponible y acordado, dejar `CATALOG_SOURCE=unconfigured` para fallar de forma explícita. No existe degradación automática a público ni a MOCK. Faltas de configuración siguen dando `UNCONFIGURED` / 503.

## Pruebas reproducibles

```sh
npm ci
npm run build
npm run typecheck
npm run test:unit -- --testPathPatterns=catalog
npm run test:e2e -- --testPathPatterns=catalog-public-read-only
npm run test:catalog:h4:config
npm test
```

Las pruebas nuevas cubren la configuración de producción, las cuatro lecturas existentes, ausencia de credenciales con token ausente o residual, no reenvío de credenciales del navegador a través del módulo Nest real, lista cerrada de métodos/rutas/parámetros, correlación, rechazo de configuración inválida y de `demo-no-auth` en producción, compatibilidad con `service-token` y ausencia de reintentos ante errores. Simulan el transporte G6; no son evidencia de disponibilidad pública real.

La suite completa requiere la configuración sintética habitual de CI: `NODE_ENV=test`, `USE_MOCKS=true`, `AUTH_ISSUER=https://security.example.test`, `AUTH_JWKS_URL=https://security.example.test/jwks` y `DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/not_connected`. Esa URL no conecta una base real; los casos que requieren una base temporal tienen sus condiciones separadas. No usar credenciales de producción para ejecutar pruebas.
