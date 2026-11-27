# TASK-F009-INT-001 — retest REAL de desempate y continuidad

**Fecha:** 27/11/2026 (UTC en la matriz). **Issue:** [Backend #57](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/57). **Alcance:** orden por nombre con nombres iguales y paginación consecutiva, a través del BFF desplegado de G1.

## Dataset confirmado por G6

| Producto | `product_id` | SKU | Nombre | Precio informado |
|---|---|---|---|---:|
| 001 | `93f7f500-077d-432e-be98-31cb9ee0d66d` | `G6-QA-MP-ORD-001` | G6 QA Marketplace Desempate | S/ 39.90 |
| 002 | `8ad24563-c9da-4305-b650-1dd47a14fffb` | `G6-QA-MP-ORD-002` | G6 QA Marketplace Desempate | S/ 49.90 |

G6 compartió el endpoint `https://api-gateway.calmgrass-aec0b33c.chilecentral.azurecontainerapps.io/api/v1/productos?canal=MARKETPLACE` y confirmó desempate por `product_id ASC`. El ID 002 precede al ID 001 tanto en `NOMBRE_ASC` como en `NOMBRE_DESC`. Los precios identifican el dataset; el BFF no proyecta SKU ni precio y F-009 sólo homologa los dos órdenes por nombre.

## Ejecución reproducible

```sh
npm run check:catalog:f009-tiebreak -- \
  --base-url https://g1-marketplace-backend.onrender.com \
  --output docs/evidencias/H4/giuliano/2026-11-27/TASK-F009-INT-001-g6-tiebreak.json
```

El runner hace cuatro `GET` sin credenciales ni cookies a `/api/v1/catalog/products`, con `q=G6 QA Marketplace Desempate`, `page=0/1`, `pageSize=1` y `sort=NAME_ASC/NAME_DESC`. Exige HTTP 200, `X-Catalog-Source: REAL`, `Cache-Control: no-store`, eco del `X-Request-Id`, `totalElements=2`, `totalPages=2` y el ID/slug esperado para cada página. No reordena resultados localmente.

El índice de página del BFF es cero-basado. Según el mapeo de [`provider.ts`](../../../../../src/catalog/provider.ts), `page + 1` produce G6 `pagina=1/2`, `pageSize=1` produce `tamanio=1`, y NAME_ASC/DESC produce `orden=NOMBRE_ASC/DESC`. Esta equivalencia se verifica en el código local; no se capturó la solicitud interna saliente de Render.

## Resultado observado

| Orden | Página BFF → G6 | Tamaño | Total / páginas | `product_id` y slug recibidos | HTTP / origen | Duración |
|---|---|---:|---:|---|---|---:|
| NAME_ASC | 0 → 1 | 1 | 2 / 2 | `8ad24563-c9da-4305-b650-1dd47a14fffb` · `g6-qa-marketplace-ord-002` | 200 / REAL | 2366 ms |
| NAME_ASC | 1 → 2 | 1 | 2 / 2 | `93f7f500-077d-432e-be98-31cb9ee0d66d` · `g6-qa-marketplace-ord-001` | 200 / REAL | 729 ms |
| NAME_DESC | 0 → 1 | 1 | 2 / 2 | `8ad24563-c9da-4305-b650-1dd47a14fffb` · `g6-qa-marketplace-ord-002` | 200 / REAL | 761 ms |
| NAME_DESC | 1 → 2 | 1 | 2 / 2 | `93f7f500-077d-432e-be98-31cb9ee0d66d` · `g6-qa-marketplace-ord-001` | 200 / REAL | 740 ms |

**Resultado del runner:** 4 PASS, 0 FAIL, 0 BLOCKED; captura íntegra y correlation IDs en [TASK-F009-INT-001-g6-tiebreak.json](TASK-F009-INT-001-g6-tiebreak.json). El acceso directo anónimo desde este entorno a G6 informó HTTP 401; no se envió token ni se adjunta respuesta upstream. El retest registrado aquí es por el BFF de G1, que respondió `REAL` con los dos IDs confirmados.

## Sondeo adicional del BFF con tamaño 2 — 27/11/2026

El OpenAPI [`openapi-catalogo-h4.json`](../../../../../docs/contratos/openapi-catalogo-h4.json) define `pageSize` (1–48, default 24) y `page` cero-basada (default 0). El controller atiende `GET /api/v1/catalog/products`; `provider.ts` mapea `page=0` a G6 `pagina=1`, `pageSize=2` a `tamanio=2` y `NAME_ASC` a `NOMBRE_ASC`. Este último mapeo es lectura de código fuente, no una captura de la solicitud interna de Render.

Se intentó una sola solicitud GET al BFF publicado con `q=G6 QA Marketplace Desempate`, `sort=NAME_ASC`, `page=0`, `pageSize=2` y `X-Request-Id=2d71d87d-63c8-4a51-b459-a06945b750db`. Hora de inicio: `2026-11-27T08:17:34.661Z`. La resolución DNS devolvió `EAI_AGAIN` en 71 ms antes de obtener respuesta HTTP. Resultado **BLOCKED**: no hay status HTTP, `X-Catalog-Source`, paging, productos ni request/correlation ID de respuesta. No existe cuerpo que sanitizar. No se reintentó ni se consultó G6 directamente. [Registro adicional estructurado](TASK-F009-INT-001-g6-tiebreak.json).

El bloqueo DNS no demuestra indisponibilidad de G1. Los cuatro PASS de tamaño 1 arriba se conservan como su ejecución anterior; el sondeo de tamaño 2 es un intento aparte y no altera esos resultados.

## Límites y trabajo restante

- El código local fija el contrato G6 en `0.6.0-rc.1`, SHA `f64bfe9a097b2a0f74c2600988305443d92f640e`. [Backend #201](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/201) está cerrado y conserva evidencia de un corte previo; no confirma la versión efectiva aguas arriba ni el SHA desplegado de G1 para estas respuestas del 27/11.
- Esto comprueba positivo REAL, empate y continuidad entre dos páginas. No prueba orden por precio, negativo/timeout en despliegue, concesiones de identidad, despliegue exacto ni aceptación independiente. No se envió `PRICE_ASC` ni `PRICE_DESC`, fuera del enum publicado de F-009.
- Backend #56 está cerrado; la dependencia formal Backend #49 sigue abierta. I-01, revisión de Sebastián/Leónidas y gates OPS aplicables permanecen sujetos a sus responsables.
- No se cierra ni se cambia el estado de #57. Esta evidencia complementa el retest publicado del 26/11; el autor no declara aceptación ni revisión independiente.
