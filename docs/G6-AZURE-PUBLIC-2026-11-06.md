# G6 Azure: prueba de consultas públicas del 06/11/2026

Rama de prueba: `test/g6-azure-public-20261106`, desde Backend develop `34e3e4c33ecbaaeb383b00ee1bf7672da818524c`. No cambia el proveedor, los valores predeterminados ni la configuración de producción.

**Resultado: 25 comprobaciones PASS y dos FAIL por HTTP 503 en filtros de precio.** Las seis rutas anunciadas respondieron correctamente en los casos probados. A diferencia del anuncio inicial, el listado ya devolvió **20 productos**; fue posible verificar detalles positivos por ID y slug.

Ensayo: **06/11/2026, 00:53:34–00:53:44 Lima** (05:53:34–05:53:44 UTC). El primer reconocimiento de las seis rutas se realizó a las 00:49 Lima. Es una muestra puntual; no acredita disponibilidad posterior ni el SHA desplegado en Azure.

Origen: `https://g6-po-axl031-167090a.chilecentral.cloudapp.azure.com`. Sólo GET, HTTPS con TLS verificado, sin Authorization, cookies ni redirecciones. No se obtiene un JWT, no se carga `.env` y no se ejecutan operaciones de administración o escritura. No hay mocks ni sustitución de respuestas de G6.

**Ampliación de evidencia a las 10:47 Lima:** [demo con frontend REAL: Home, marca Nike, ficha y galería](evidencias/H4/giuliano/2026-11-06/azure-browser/README.md). Se ejecutó el Backend develop v1.7.0 `3ec390c` y Frontend v1.3.0 `28f4bb0`, posteriores al corte HTTP descrito aquí. F011 respondió 200 REAL e imágenes decodificadas; variantes, precio y disponibilidad de la ficha siguieron mostrando sus 503 locales. La evidencia nueva no reemplaza ni reinterpreta este ensayo histórico de las 00:53.

## Resultados HTTP directos

| Caso | HTTP | Comprobación |
| --- | --- | --- |
| `/health` | 200 | JSON con `status: "ok"`; no representa la salud de cada API |
| `/api/v1/categorias` | 200 | Ocho categorías, IDs únicos y estructura válida |
| `/api/v1/marcas` | 200 | Seis marcas, IDs únicos y estructura válida |
| `/api/v1/productos?canal=MARKETPLACE` | 200 | 20 items y total 20, página 1 y tamaño 20 |
| Búsqueda Nike | 200 | Siete resultados, nombres acordes con la búsqueda |
| Categoría Balones | 200 | Cuatro resultados, todos con la categoría solicitada |
| Nike + Balones, sin precio | 200 | Dos resultados |
| Marca Nike | 200 | Siete resultados, todos con la marca solicitada |
| Nombre ASC y DESC | 200 | Orden de los nombres y universo coherentes |
| Páginas 1, 2 y última, tamaño 4 | 200 | Total estable, sin solapamiento entre las dos primeras páginas, IDs acordes con la lista completa |
| Página fuera de rango | 200 | Items vacíos y total 20 conservado |
| Búsqueda sin coincidencias | 200 | Items vacíos y total cero |
| Detalle ID `2ee6399e-2333-5916-847b-f6d2a0f03527` | 200 | ID, slug, nombre y marca coinciden con el listado |
| Detalle slug `nike-academy-hv4386-100` | 200 | Mismo producto que el detalle por ID |
| ID y slug inexistentes generados para la prueba | 404 | `PRODUCTO_NO_ENCONTRADO`, `application/problem+json` y correlación preservada |
| Rango S/ 0–100, sin categoría | **503** | Sigue pendiente en G6 |
| Nike + Balones + rango S/ 0–100 | **503** | Sigue pendiente en G6 |

Los nombres del dataset no contienen un caso acreditado de empate entre páginas; esta prueba no certifica el desempate por ID para nombres iguales. Un 404 de un ID aleatorio no demuestra por sí solo el tratamiento de todos los productos en borrador o de otro canal.

## Consumo desde G1

Se construyó este Backend desde lockfile en el worktree aislado y se ejecutó su `createRealProvider` compilado contra el origen Azure, con configuración local explícita:

```dotenv
NODE_ENV=test
CATALOG_SOURCE=real
CATALOG_INTEGRATION_APPROVED=true
PRODUCTOS_BASE_URL=https://g6-po-axl031-167090a.chilecentral.cloudapp.azure.com
PRODUCTOS_AUTH_MODE=public-read-only
PRODUCTOS_SERVICE_TOKEN=
PRODUCTOS_CONTRACT_VERSION=0.6.0-rc.1
PRODUCTOS_CONTRACT_SHA=f64bfe9a097b2a0f74c2600988305443d92f640e
PRODUCTOS_MEDIA_HOSTS=slzglmtiyrzygpkiuthf.supabase.co
PRODUCTOS_TIMEOUT_MS=15000
```

Las seis comprobaciones del consumidor pasaron: Home con ocho categorías; filtros con ocho categorías y seis marcas; búsqueda Nike; segunda página con orden descendente; categoría; marca. El transporte real verificó GET y ausencia de Authorization/Cookie en cada llamada. Las tarjetas aceptaron las imágenes del host exacto configurado; no apareció `UNAPPROVED_MEDIA_HOST` en esta muestra.

Este ensayo del adaptador no es una prueba de navegador ni del servicio G1 desplegado. No activa F011 en develop: los detalles 200 indicados arriba son consultas directas a G6. Los dos atributos observados en Nike Academy siguen sin un valor textual legible; no mostrar `valor_id` como si fuera una especificación comercial. No se probó descarga visual de imágenes ni galería en este ensayo.

## Reproducir desde esta rama

Requiere Node compatible con el repositorio y acceso al entorno antes de su apagado anunciado: **viernes 06/11/2026, 13:00 Lima**. No configura Render ni cambia la URL productiva de G1.

```sh
npm ci --no-audit --no-fund
npm run build
npm run check:g6:azure -- --consumer --output docs/evidencias/H4/g6-azure-public-20261106.json
```

Sin `--consumer`, sólo consulta G6 y no necesita `dist`. El comando con `--consumer` requiere el build de esa misma rama. El probe es manual, no se agrega al CI habitual ni introduce una dependencia permanente del horario de Azure.

El comando **termina con código 1 mientras falle cualquiera de los casos**, incluidos los dos rangos de precio. No convierte esos 503 en PASS, lista vacía ni fixtures. Las respuestas de producto no contienen precios suficientes para certificar elegibilidad monetaria; se necesita el esperado de Catalog/Pricing cuando ese filtro esté operativo.

Validaciones realizadas: instalación limpia desde lockfile y build PASS; sintaxis del script PASS; ejecución real 25 PASS / 2 FAIL externos; `git diff --check` PASS. No se presenta la suite completa como verde ni se afirma homologación autenticada con G7.

## Evidencia y consultas pendientes

[Resultados saneados](evidencias/H4/g6-azure-public-20261106.json): URLs, fechas, estados, cantidades, duración y correlaciones; no contiene JWT, secretos, cookies ni cuerpos completos de catálogo. El script está en [check-g6-azure.mjs](../scripts/check-g6-azure.mjs).

Las dos URLs fallidas y sus correlaciones están en los casos `price-0-100` y `category-price-0-100` de ese archivo. El origen de los 503 requiere logs del despliegue Azure; no se da por probado que coincida con la causa del preview anterior de DuckDNS.

No se pide cambiar producción ni ampliar la lista de imágenes. La decisión anterior de demo sin marca ni precio se mantiene hasta que el equipo revise este resultado y acuerde el recorrido.
