# TASK-F009-INT-001 (#57): retest REAL de desempate y continuidad

Fecha: 2026-11-27 (UTC)
Repositorio: `Taller-SW-Web/G1-Marketplace-Backend`
Alcance: cuatro lecturas al BFF publicado, para los dos órdenes y sus páginas 0 y 1, con tamaño 1.

## Preflight y corte

- #57 está abierta. La dependencia backend #56 está cerrada; la dependencia formal #49 permanece abierta. La decisión de Jim permite revisar el cierre de #57 separado de #45, sin cambiar las dependencias formales ni el estado.
- G6 confirmó dos productos con el mismo nombre (`G6 QA Marketplace Desempate`) y desempate por `product_id ASC`: `ord-002` / `8ad24563-c9da-4305-b650-1dd47a14fffb` antes de `ord-001` / `93f7f500-077d-432e-be98-31cb9ee0d66d`, en NAME_ASC y NAME_DESC.
- BFF Render: `https://g1-marketplace-backend.onrender.com`; SHA live confirmado en logs por revisión raíz: `bcac2f6b279954c43bfa067a773c6629c6bbc502`.
- Cada caso fue un GET independiente sin credenciales ni cookies, con timeout de 8 s. No se repitió ningún caso.

## Resultado

Ruta común: `/api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&sort={NAME_ASC|NAME_DESC}&page={0|1}&pageSize=1`.

| # | Orden / página | Fin cliente UTC | HTTP / origen | Producto e ID | Total / páginas | `X-Request-Id` | Duración Render |
|---:|---|---|---|---|---|---|---:|
| 1 | NAME_ASC / 0 | 18:42:15.832933Z | 200 / REAL | `g6-qa-marketplace-ord-002` · `8ad24563-c9da-4305-b650-1dd47a14fffb` | 2 / 2 | `0088eb53-710c-4d7e-93ec-36a11101a83f` | 2.44 s |
| 2 | NAME_ASC / 1 | 18:42:34.398189Z | 200 / REAL | `g6-qa-marketplace-ord-001` · `93f7f500-077d-432e-be98-31cb9ee0d66d` | 2 / 2 | `4afd4a2d-c2e3-4656-b00f-49ff04213103` | 1.14 s |
| 3 | NAME_DESC / 0 | 18:42:52.907749Z | 200 / REAL | `g6-qa-marketplace-ord-002` · `8ad24563-c9da-4305-b650-1dd47a14fffb` | 2 / 2 | `5f0d10a8-c26e-4222-a1df-317bd7fb0f82` | 1.53 s |
| 4 | NAME_DESC / 1 | 18:43:10.115910Z | 200 / REAL | `g6-qa-marketplace-ord-001` · `93f7f500-077d-432e-be98-31cb9ee0d66d` | 2 / 2 | `be02fbca-29d3-4e5b-b2d6-f774755f6bfa` | 1.11 s |

Todas las respuestas devolvieron `Cache-Control: no-store`, `pageSize=1`, `totalElements=2` y `totalPages=2`. Para el dataset homónimo, ambas ordenaciones conservaron 002 → 001; la página 1 continuó la página 0 sin duplicados. Render confirmó los cuatro IDs como `GET /api/v1/catalog/products`, HTTP 200 / REAL, en el SHA indicado arriba.

Las respuestas y logs sólo exponen el request ID del BFF. No se observó `X-Correlation-Id` de G6, ID de correlación upstream ni versión de runtime en headers o cuerpo; por tanto, no se afirma correlación de extremo a extremo ni una versión upstream efectiva. La versión contractual del código local no se usa como evidencia de versión desplegada.

## Alcance y límites

Este retest acredita el positivo de desempate y continuidad para estos dos productos en el corte REAL revisado. No prueba otros conjuntos de datos, negativos, timeout ni cobertura de UI, y no reemplaza revisión independiente. No se cambió estado, etiqueta o asignación de #57; #49 continúa abierta.
