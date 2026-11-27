# TASK-F010-INT-001 — paginación API por defecto

**Fecha:** 2026-11-27 (UTC)
**Estado de issue:** #61 permanece `open / Bloqueado`. No se modificaron estados, labels, dependencias ni DoD.

## Alcance

Se comprobó el subconjunto API de paginación solicitado: dos páginas consecutivas con el mismo texto de búsqueda, `pageSize=1` y sin parámetro `sort`. No se probó UI, reset de URL, OPEN-03, ni el recorrido de integración completo. No se llamó G6 directamente y no se usaron credenciales.

En el código del corte live revisado (`ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f`), `parseQuery` acepta `sort` omitido (`undefined`) y pasa `page`/`pageSize`; el provider sólo añade `orden` a la petición upstream cuando `sort` tiene valor. El contrato permite por tanto omitir `sort`; la respuesta BFF indica `sort: null`.

## Corte observado

Render reportó `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f` como `live` en el chequeo de 2026-11-27 17:12:33 UTC (deploy `dep-dc4q1ue0tbcc73der13g`). El deploy posterior de `bcac2f6b279954c43bfa067a773c6629c6bbc502` terminó `update_failed` a las 17:12:54 UTC, antes de la primera petición. La lectura de deploys posterior siguió mostrando ese intento como fallido. La rama de evidencia se basa en el SHA live `ab4ffca8...`.

## Lecturas BFF

Ambas solicitudes fueron GET de sólo lectura a `https://g1-marketplace-backend.onrender.com/api/v1/catalog/products`, sin `sort`, con `q=G6 QA Marketplace Desempate` y `pageSize=1`.

| Página solicitada | Inicio UTC / `Date` HTTP | HTTP / source | Request ID BFF | Resultado |
| --- | --- | --- | --- | --- |
| `page=0` | 17:13:00 / 17:13:08 UTC | 200 / `REAL` | `aac3cd5f-4627-498c-9f41-dcdcde75c8cd` | `sort:null`; `page.number=0`, `size=1`, `totalElements=2`, `totalPages=2`; un producto: ID `8ad24563-c9da-4305-b650-1dd47a14fffb` (`g6-qa-marketplace-ord-002`). |
| `page=1` | 17:13:15 / 17:13:18 UTC | 200 / `REAL` | `1657a01b-67dd-4041-98a5-4a1563d1ea85` | `sort:null`; `page.number=1`, `size=1`, `totalElements=2`, `totalPages=2`; un producto: ID `93f7f500-077d-432e-bce98-31cb9ee0d66d` (`g6-qa-marketplace-ord-001`). |

URLs sanitizadas solicitadas:

- `GET /api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&page=0&pageSize=1`
- `GET /api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&page=1&pageSize=1`

## Resultado y límites

- **PASS:** Las dos respuestas fueron HTTP 200 con `X-Catalog-Source: REAL`; cada página devolvió un elemento y reportó `totalElements=2` y `totalPages=2`.
- **PASS:** Los dos UUID observados son distintos y no hay solapamiento entre estas dos páginas consecutivas. La respuesta de página 0 mostró 002 y la de página 1 mostró 001.
- **INCONCLUSIVE:** No se envió orden explícito. `sort:null` y el orden observado se registran como salidas de estas peticiones; no se afirma que el orden predeterminado esté garantizado ni estable entre snapshots.
- El `X-Request-Id` corresponde al BFF. No se expusieron correlation ID de G6, versión del proveedor ni identificador de snapshot/universo.
- Esta evidencia no verifica más de las dos filas indicadas, continuidad de un snapshot entre solicitudes, navegación/reset en UI, URL ni OPEN-03.

## Dependencias y criterio restante

- BE #60 y OPS/I-01 #200 están cerradas según el preflight.
- La dependencia formal [BE #49](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/49) sigue `open / Bloqueado`, pese a su evidencia positiva de búsqueda publicada. No se cambia esa dependencia.
- [BE #61](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/61) permanece `open / Bloqueado`. Para el cierre siguen pendientes la dependencia formal #49 y la verificación UI de reset/URL/OPEN-03, además de cualquier revisión independiente aplicable.

## Reproducibilidad de las solicitudes

```sh
curl --silent --show-error --connect-timeout 10 --max-time 20 --include \
  'https://g1-marketplace-backend.onrender.com/api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&page=0&pageSize=1'

curl --silent --show-error --connect-timeout 10 --max-time 20 --include \
  'https://g1-marketplace-backend.onrender.com/api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&page=1&pageSize=1'
```

Se ejecutaron exactamente esas dos lecturas, una por página y sin reintentos. No se ejecutaron suites locales.
