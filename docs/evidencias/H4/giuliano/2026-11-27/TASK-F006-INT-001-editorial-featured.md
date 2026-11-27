# TASK-F006-INT-001 — verificación REAL de destacado editorial, 27/11/2026

Responsable: Giuliano Macchiavello. [Backend #45](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/45) sigue abierto y sin cambio de estado. #44 está cerrado; OPS #200, #201 y #206 están cerrados. La evidencia de OPS #201 documenta la cadena Vercel → Render → G6 y `CATALOG_SOURCE=real`; no comprueba por sí sola el destacado editorial de Home. El criterio específico de Home sigue pendiente.

## Aclaración de alcance y comportamiento actual

G6 confirmó que la elección editorial del producto corresponde a G1 y propuso el ID `93f7f500-077d-432e-be98-31cb9ee0d66d` como candidato de prueba. G6 es fuente autoritativa de los datos/estado publicables del producto; esta selección no se atribuye a G6.

El BFF expone `GET /api/v1/catalog/home`; la ruta Next.js de la web es `/api/catalog/home`. `CatalogModule` lee `CATALOG_FEATURED_ENABLED`, `CATALOG_FEATURED_APPROVED` y `CATALOG_FEATURED_IDS` mediante `ConfigService`. `configuredFeaturedIds(env, 'REAL')` requiere `CATALOG_FEATURED_ENABLED=true` y `CATALOG_FEATURED_APPROVED=true`, acepta hasta ocho UUIDs en el orden editorial y devuelve una lista vacía cuando las flags están apagadas o no hay IDs. El provider REAL también requiere `CATALOG_INTEGRATION_APPROVED=true` y configuración G6 aprobada (endpoint, pin de contrato y modo de autenticación); si se usa `PRODUCTOS_AUTH_MODE=public-read-only`, el gate de entorno también exige `BFF_MODE=real`. Home revalida cada ID mediante `GET /api/v1/productos/{productoId}?canal=MARKETPLACE`; G6 puede confirmar que un ID no está publicable y esa tarjeta se omite.

El comentario de [#45 del 26/11](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/45#issuecomment-7205470770) registra Home Render REAL 200 y diez categorías, con `featuredProducts` vacío. Esa observación no identifica la causa y no se atribuye a G6. El estado actual de las variables del servicio no se expone en el resultado de lectura del conector Render; por tanto, no afirmo qué flags están configuradas en producción.

Render confirmó el servicio `g1-marketplace-backend` (`srv-db05v0navr4c73e9mnug`), runtime Node, rama `main`, auto-deploy activo. El [Blueprint](../../../../../render.yaml) declara `envVars` para el servicio, pero no enumera `CATALOG_FEATURED_*`; el código sí consume esos valores del entorno. No se cambió configuración ni se desplegó el servicio compartido. Los flags actuales del entorno no se consultaron ni se sustituyeron.

## Checker reproducible

El [checker](../../../../../scripts/catalog-h4/check-f006-featured-real.mjs) requiere un ID UUID explícito, hace un único GET sin credenciales a `GET /api/v1/catalog/home`, comprueba HTTP 200, `X-Catalog-Source: REAL`, `Cache-Control: no-store`, correlación y que `featuredProducts` contenga exactamente una tarjeta con el ID esperado. No tiene un ID de producto por defecto, no configura variables de entorno y no consulta G6 directamente. Si el ID falta, informa `EXPECTED_FEATURED_ID_MISSING`; el resultado no atribuye la causa al proveedor.

La configuración es temporal y requiere aprobación OPS/PO antes de aplicarse a un servicio de prueba aislado. El prerrequisito operativo exacto es que OPS/PO habilite un BFF de prueba Render aislado, accesible por HTTPS y construido desde el SHA que se va a probar; debe contar con la conexión G6 REAL autorizada, `CATALOG_INTEGRATION_APPROVED=true` y los pins/modo de autenticación G6 que exige ese build. Si su modo autorizado es `public-read-only`, el entorno debe incluir `BFF_MODE=real`. No basta con cambiar sólo las tres variables de destacados en el servicio `main` existente. Pasos pendientes:

1. Usar ese BFF Render aislado con acceso REAL ya autorizado; no cambiar el servicio compartido `g1-marketplace-backend` de `main`.
2. Con autorización OPS/PO, configurar temporalmente en el servicio aislado `CATALOG_SOURCE=real`, `CATALOG_INTEGRATION_APPROVED=true`, `CATALOG_FEATURED_ENABLED=true`, `CATALOG_FEATURED_APPROVED=true`, `CATALOG_FEATURED_IDS=93f7f500-077d-432e-be98-31cb9ee0d66d` y `CATALOG_HOME_FALLBACK_ENABLED=false`. Conservar el modo y los secretos/configuración G6 ya autorizados; no poner sus valores en comandos, trazas o Git.
3. Esperar el deploy aprobado y registrar su SHA/deployment ID. Ejecutar el checker contra la URL del servicio de prueba:

   ```sh
   npm run check:catalog:f006-featured-real -- \
     --base-url https://<bff-de-prueba> \
     --expected-product-id 93f7f500-077d-432e-be98-31cb9ee0d66d \
     --timeout-ms 20000 \
     --output docs/evidencias/H4/giuliano/2026-11-27/TASK-F006-INT-001-featured-real.json
   ```

4. Exigir PASS con fuente REAL, correlación y presencia única del ID; guardar el JSON y SHA. Después, restaurar las variables temporales del servicio de prueba y registrar la reversión.

**Resultado de ejecución:** pendiente. No ejecuté el checker porque OPS/PO debe autorizar y configurar el servicio aislado. No llamé al endpoint compartido ni cambié env/deploy. Si el ID no aparece después de aplicar esa configuración, revisar por separado la configuración efectiva y el estado publicable del producto; no concluir que el origen es G6 sin evidencia.

## Validación de este artefacto

- `node --check scripts/catalog-h4/check-f006-featured-real.mjs`: PASS; `JSON.parse(package.json)`: PASS.
- Invocación local del export con `fetchImpl` sintético: el ID esperado presente produjo PASS; lista vacía produjo `EXPECTED_FEATURED_ID_MISSING`; omitir el ID esperado rechazó antes de realizar un fetch. No se llamó a Render ni a G6.
- `git diff --cached --check`: PASS.
- Resultado del checker REAL: pendiente de OPS/PO y despliegue de prueba aislado.
