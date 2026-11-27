# TASK-F008-INT-001 (#53): retest REAL de búsqueda y rango

Fecha: 2026-11-27 (UTC)
Repositorio: `Taller-SW-Web/G1-Marketplace-Backend`
Propósito: repetir el caso combinado de búsqueda y rango S/40–50 después del cambio del BFF a APIM de G6.

## Corte y precondiciones observadas

- Andrés confirmó el BFF publicado en Render con G6 APIM y flujo `client_credentials`. SHA publicado: `bcac2f6b279954c43bfa067a773c6629c6bbc502`.
- G7 respondió HTTP 200 al flujo de emisión; se validó `aud=api-productos`. No se almacena ni registra ningún token o secreto.
- A las `2026-11-27T17:57:30.903Z`, la lectura de catálogo a través de G6 APIM respondió HTTP 200 con página 1/tamaño 5 y cinco productos; `X-Correlation-Id: 89f397e3-b734-4d9c-b2ea-3e77ad3ed0ba`. Es un sondeo independiente, no la traza del request BFF de abajo.
- Como control separado, `GET /api/v1/catalog/products?page=0&pageSize=5` en el BFF respondió HTTP 200 / `X-Catalog-Source: REAL`, `X-Request-Id: a34721f3-c77e-43e2-941c-94a9a32ee6b7`.
- La prueba anterior de este caso, a las `16:47:30Z`, había terminado en HTTP 503 `CATALOG_TIMEOUT`, request ID `b8591908-de44-4431-8241-08c148ca813f`. Ese resultado queda como antecedente y no se volvió a interpretar como el resultado actual.

## Caso ejecutado

Una sola petición HTTP GET, de lectura, al BFF público:

```text
/api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&minPrice=40&maxPrice=50&page=0&pageSize=2
```

Ventana cliente: `2026-11-27T18:34:25.944913Z`–`2026-11-27T18:34:28.819552Z`.

| Comprobación | Resultado |
|---|---|
| HTTP | `200` |
| `X-Catalog-Source` | `REAL` |
| `X-Request-Id` | `ad0d4304-b36a-4d9d-bdce-e0a1d738fd5d` |
| `Cache-Control` | `no-store` |
| Página | `number=0`, `size=2`, `totalElements=1`, `totalPages=1` |
| Producto devuelto | `g6-qa-marketplace-ord-002` — `G6 QA Marketplace Desempate` |

Render registró el mismo request ID en `GET /api/v1/catalog/products`, HTTP 200 / REAL, con duración de 2.537 s y el SHA live indicado arriba. La respuesta no presentó un correlation ID de G6 para esta petición; por ello, no se afirma una correlación de extremo a extremo. El dataset comunicado por G6 identifica `ord-002` en S/49.90 y `ord-001` en S/39.90; el resultado único es coherente con el rango inclusivo S/40–50. La respuesta comprobada por el cliente muestra el slug y nombre devueltos.

## Alcance del resultado

El caso positivo integrado de búsqueda más rango queda acreditado en el corte REAL publicado. No se cambió estado, etiqueta ni asignación de #53. Esta nota no afirma aceptación de los restantes criterios de F-008 (maestros, otros filtros, negativos, timeout, UI ni revisión independiente), ni cierre de la dependencia formal #49.
