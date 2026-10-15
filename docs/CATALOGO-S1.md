# Catálogo S1 — F-006 / F-007 — Giuliano

Implementación local parcial para H3. El modo `MOCK` permite probar la cadena web → Next → BFF sin datos personales ni dependencia de PostgreSQL. No acredita integración real, aprobación de diseño, revisión del equipo ni cierre de H3.

## Ejecutar

Requisito para este corte: Node.js 22.18 o posterior.

```powershell
npm ci
$env:CATALOG_SOURCE = 'mock'
npm start
```

El BFF escucha por defecto en el puerto 10000. `PORT` y `HOST` son configurables. Las rutas de catálogo funcionan sin PostgreSQL; `/health` conserva la comprobación de base de datos y responde 503 si no está disponible. No se simula un health de base de datos exitoso.

```powershell
npm test
npm run build
```

## Rutas de Marketplace

- `GET /api/v1/catalog/home`: categorías activas y `featuredProducts: []` mientras G-FEATURED permanezca abierto.
- `GET /api/v1/catalog/products?q=running&page=0&pageSize=24`: búsqueda normalizada de 2–120 caracteres. Consulta vacía equivale al catálogo.
- `page` entero no negativo; `pageSize` de 1 a 48. Salida: `data` y `page(number,size,totalElements,totalPages)`.
- `categoryIds` permite únicamente un ID en este corte, correspondiente a `categoriaId` singular del candidato G6. Este corte de inicio/búsqueda no ofrece selección múltiple, marcas ni rango de precio.
- `sort=NAME_ASC|NAME_DESC` está preparado en validación/adaptador; no hay selector de orden en la UI de este corte.
- Parámetros desconocidos, duplicados y filtros administrativos se rechazan antes del proveedor.
- `X-Catalog-Source: MOCK|REAL|UNCONFIGURED` y `Cache-Control: no-store` permiten clasificar evidencia.
- Errores públicos 400/503 con `code`, `title`, `status` y `requestId`. 401/403/429/5xx del proveedor no cierran la sesión del visitante: se convierten en catálogo no disponible.

## Contrato externo consultado

Fuente de lectura: [OpenAPI G6](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/master/contratos/http/openapi.yaml), versión **0.6.0-rc.1**, blob SHA **f64bfe9a097b2a0f74c2600988305443d92f640e**, consultado el 14/10/2026. Véase [alineación Marketplace](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/master/integraciones/ALINEACION_MARKETPLACE.md). Es un candidato documental; falta conformidad bilateral, ambiente, grants y prueba real.

Mapeos implementados y probados con respuestas sintéticas:

| Marketplace            | G6                                                            |
| ---------------------- | ------------------------------------------------------------- |
| Home                   | `GET /api/v1/categorias`, arreglo `categories`, sólo `ACTIVA` |
| Búsqueda               | `GET /api/v1/productos?canal=MARKETPLACE`                     |
| `page`, `pageSize`     | `pagina=page+1`, `tamanio=pageSize`                           |
| `categoryIds` singular | `categoriaId`                                                 |
| `NAME_ASC/DESC`        | `NOMBRE_ASC/DESC` en `orden`                                  |
| `productId`            | `product_id`                                                  |
| Imagen pública         | Primera `images[]`, HTTPS y hostname permitido                |
| Identificadores        | `product_id`, `marca_id`, `categoria_id` permanecen opacos    |
| Correlación            | BFF genera UUID y envía `X-Correlation-Id`                    |

No se replica el catálogo ni se accede a la BD de G6. No se deduce SKU. Precio, stock, favoritos y ficha son integraciones posteriores. El DTO mínimo de tarjeta usa `productId`, `slug`, `name`, `categoryId`, `brandId`, `image`; no inventa precio, nombre de marca ni stock. Esto requiere revisión de Leonidas/Jim frente a las tarjetas comerciales completas de las specs G1 antes de cerrar F-006/F-007.

## Activación real, sólo tras aprobación registrada

Configurar en el entorno del proceso, sin subir secretos:

```dotenv
CATALOG_SOURCE=real
CATALOG_INTEGRATION_APPROVED=true
PRODUCTOS_BASE_URL=https://HOST_APROBADO
PRODUCTOS_SERVICE_TOKEN=CONFIGURAR_COMO_SECRETO
PRODUCTOS_CONTRACT_VERSION=0.6.0-rc.1
PRODUCTOS_CONTRACT_SHA=f64bfe9a097b2a0f74c2600988305443d92f640e
PRODUCTOS_MEDIA_HOSTS=HOST_DE_IMAGENES_APROBADO
PRODUCTOS_TIMEOUT_MS=5000
CORS_ORIGIN=https://FRONTEND_APROBADO
```

La URL base es el origen de G6, sin `/api/v1`. No contiene credenciales, query ni fragmento. Sólo HTTPS; HTTP loopback se permite en desarrollo para tests. Los hosts de medios son exactos, sin comodines. No se siguen redirecciones del proveedor. La bandera representa una decisión humana registrada; ponerla en `true` por sí solo no prueba homologación ni runtime.

Si falta configuración, las lecturas responden 503. Si falla G6, responden error y no cambian a fixtures. Producción rechaza explícitamente el modo mock. La evidencia de error usa códigos diagnósticos seguros y hash de búsqueda; no incluye token, consulta cruda, cuerpos externos ni errores de base de datos.

## Handoff y pendientes

- Sebastian: revisar DTO/tarjeta, ruta `/productos/{slug}`, retorno y ensamblaje de ficha. No se implementó F-011.
- Leonidas: revisar mapeo, validación runtime, contrato candidato y homologación.
- Andres: revisar cambios de `src/server.js` frente a `origin/chore/s1-base-despliegue`, CORS, despliegue y health. Esa rama no fue fusionada automáticamente.
- Diego/Jim: registrar capacidad/revisión, dependencia I-01, conformidad del primer corte sin precio y evidencia real antes de cierre.
- Frontend: `MARKETPLACE_API_URL` apunta al BFF; ninguna credencial técnica viaja al navegador.

Los cambios están en `feat/s1-f006-f007-catalogo`, creada desde `origin/develop`. Por instrucción actualizada de Giuliano, se crean commits y se sube la rama al remoto, sin publicar a main ni abrir PR. Giuliano preparará el PR manualmente al terminar; revisión independiente pendiente.

## Elementos compartidos

Consultar la [guía de elementos compartidos](ELEMENTOS-COMPARTIDOS.md) para contratos, consumo, ownership y límites del corte.
