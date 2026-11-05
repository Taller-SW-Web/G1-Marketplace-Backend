# Demo de catálogo: viernes 06/11/2026, 12:00 Lima

Decisión del 05/11: **MOCK rotulado en local**. REAL conserva bloqueos de marcas/precio, ranking y ficha comercial. El permiso del host de imágenes no resuelve esas dependencias. No hay fallback automático de REAL a fixtures.

## Ejecución local

Revisar Backend #265/#266 y Frontend #124/#125 juntos, manteniendo las PR separadas. #232 Backend y #107 Frontend ya están en develop; #110 Frontend está contenido en #124.

Desde Frontend, con el Backend compatible en el directorio hermano:

```sh
npm ci
npm --prefix ../G1-Marketplace-Backend ci
npm run demo:catalogo:h4 -- --featured
```

El runner construye ambos proyectos, configura `CATALOG_SOURCE=mock`, `BFF_MODE=mock` y `NODE_ENV=test` sólo en Backend local; Next usa su build de producción. Abrir `http://127.0.0.1:3500/catalogo?q=running&pageSize=4`. Comprobar el aviso visible MOCK, `X-Catalog-Source: MOCK` y `meta.source: MOCK`.

Recorrido prioritario: Home con destacados definidos sintéticos → catálogo → categoría/marca/rango PEN → nombre ASC/DESC → segunda/última página → ficha y regreso conservando URL. La ficha `/productos/producto-demostracion-7` requiere #266/#125: «Disponibilidad por confirmar», reintento y sin compra; no equivale a agotado. Probar además disponible, pocas unidades y agotado. Las ventas y productos del demo son sintéticos.

**Límite operativo:** la guarda existente prohíbe `CATALOG_SOURCE=mock` con `NODE_ENV=production`. Este es un demo local. No se prescribe cambiar NODE_ENV del Render compartido ni retirar esa guarda. Un demo alojado necesita un entorno separado acordado con Andrés. Producción queda exclusivamente a su cargo.

## Imágenes G6, sólo ensayo local

```dotenv
PRODUCTOS_MEDIA_HOSTS=slzglmtiyrzygpkiuthf.supabase.co
```

Lista de hosts exactos separados por comas, nunca `*.supabase.co`. Se inyecta la variable en el proceso local, sin cambiar el validador. `ProductCard.tsx` y `ProductGallery.tsx` usan `<img>` directamente; no necesitan `images.remotePatterns` en `next.config.ts`.

[Confirmación del almacenamiento oficial y su estabilidad solicitada a G6](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/pull/137#issuecomment-6661026839). Sigue pendiente: observar un URL no constituye aprobación del dueño. La ficha y disponibilidad REAL del BFF siguen cerradas por I-01 y devuelven 503. Cargar una imagen de tarjeta REAL no demuestra un recorrido completo REAL de ficha.

## Entrega a Andrés para producción REAL

Sólo Andrés configura Render con las revisiones aprobadas y compatibles:

| Variable | Valor o procedencia |
| --- | --- |
| CATALOG_SOURCE | real |
| CATALOG_INTEGRATION_APPROVED | true, tras aprobación de integración |
| PRODUCTOS_BASE_URL | Origen HTTPS oficial G6, sin /api/v1 |
| PRODUCTOS_SERVICE_TOKEN | Sólo canal seguro de Render; nunca chat, Git ni frontend |
| PRODUCTOS_CONTRACT_VERSION | 0.6.0-rc.1 |
| PRODUCTOS_CONTRACT_SHA | f64bfe9a097b2a0f74c2600988305443d92f640e |
| PRODUCTOS_MEDIA_HOSTS | slzglmtiyrzygpkiuthf.supabase.co, sujeto a confirmación G6 |
| PRODUCTOS_TIMEOUT_MS | 100–30000 ms; defecto 5000; coordinar presupuesto con Next |

`PRODUCTOS_AUTH_MODE=demo-no-auth` está prohibido en producción. El ensayo público local sin JWT no prueba grant. El frontend necesita `MARKETPLACE_API_URL` server-only hacia el BFF compatible. Un `/live` 200 no valida integración: comprobar catálogo, origen, imágenes en navegador, ficha y disponibilidad después del despliegue. Referencia histórica: Backend `docs/DESPLIEGUE-H3.md`. No se configura producción ni se incluye ningún token con esta entrega.
