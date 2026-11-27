# TASK-F009-INT-001 — retest REAL de desempate entre páginas

Fecha: 2026-11-27 (UTC). #57 permanece `open` / `Bloqueado`.

## Estado y dependencias

- Preflight GitHub: #57 `open` / origen `Bloqueado`; BE #56 `closed`; OPS/I-01 #200 `closed`; dependencia formal BE #49 `open` / `Bloqueado`. No se modificaron issues, estados ni labels.
- Este retest cubre sólo el subconjunto independiente de orden y continuidad de dos homónimos entre páginas. No intenta completar la matriz ni liberar la dependencia formal #49, cuyos demás criterios siguen pendientes.

## Corte live y contrato inspeccionado

- La lectura de despliegues Render mostró el servicio `g1-marketplace-backend` live en deploy `dep-dc4q1ue0tbcc73der13g`, SHA `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f`, árbol `028fdea911652a08b7d59de0eb882b8e47fef0cb`. No se toma `origin/main` `9ab5d4364f6db22a7691f08a62f9214d0556843b` como live; sus intentos de despliegue figuran `update_failed`.
- El código revisado es el del SHA live. El BFF acepta `q`, `sort`, `page` y `pageSize`; el adaptador traduce `page=0/1` a `pagina=1/2`, `pageSize=1` a `tamanio=1`, y `NAME_ASC`/`NAME_DESC` a `NOMBRE_ASC`/`NOMBRE_DESC`, con desempate delegado al proveedor. `src/catalog/catalog-tie-order.spec.ts` comprueba el desempate ID ASC con fixture local; no se ejecutó en este retest y no sustituye las observaciones REAL de abajo.
- Los cuatro resultados REAL cubren exclusivamente el universo de 2 productos que devuelve esta búsqueda. Las respuestas no exponen versión de G6, identificador de universo, precio ni `correlationId` upstream. `X-Request-Id` es el ID del BFF; no se presenta como correlationId de G6.

## Cuatro lecturas al BFF

Todas usaron una sola petición por combinación, sin retries, con el mismo query `q=G6 QA Marketplace Desempate`, `pageSize=1`:

| Orden | Página | Hora de respuesta UTC | HTTP / fuente | ID y total de respuesta | `X-Request-Id` del BFF |
| --- | ---: | --- | --- | --- | --- |
| `NAME_ASC` | 0 | `2026-11-27T16:26:38Z` | 200 / `REAL` | `8ad24563-c9da-4305-b650-1dd47a14fffb` (`ord-002`); total 2, página 0/2 | `83f95c2c-68b3-4048-b5cd-b53320e339fd` |
| `NAME_ASC` | 1 | `2026-11-27T16:26:49Z` | 200 / `REAL` | `93f7f500-077d-432e-be98-31cb9ee0d66d` (`ord-001`); total 2, página 1/2 | `db382483-9b40-4a54-9264-9e7f105a3cac` |
| `NAME_DESC` | 0 | `2026-11-27T16:27:11Z` | 200 / `REAL` | `8ad24563-c9da-4305-b650-1dd47a14fffb` (`ord-002`); total 2, página 0/2 | `1d90b8e9-ef73-455a-9b17-15041a0614f0` |
| `NAME_DESC` | 1 | `2026-11-27T16:27:22Z` | 200 / `REAL` | `93f7f500-077d-432e-be98-31cb9ee0d66d` (`ord-001`); total 2, página 1/2 | `d70c37f6-b199-47a5-a64c-f1f17445e90e` |

Ambos registros tienen el nombre `G6 QA Marketplace Desempate`. Para estos dos productos, las cuatro respuestas conservaron 002 → 001 tanto en `NAME_ASC` como en `NAME_DESC`, con un producto por página. **Resultado del subconjunto probado: PASS (BFF REAL, 4/4).** Esto no constituye garantía global para otros nombres/datos ni confirma la correlación de extremo a extremo con G6.

## Procedimiento y límites

- Worktree aislado: `/tmp/G1-Marketplace-Backend-integration-f009-ordering-20261127`, rama `integration/giuliano-f009-order-paging-20261127`, basada en SHA live `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f`. El checkout principal no se modificó.
- Requests (cada una se ejecutó exactamente una vez):

```text
GET /api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&sort=NAME_ASC&page=0&pageSize=1
GET /api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&sort=NAME_ASC&page=1&pageSize=1
GET /api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&sort=NAME_DESC&page=0&pageSize=1
GET /api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&sort=NAME_DESC&page=1&pageSize=1
```

- No se llamó G6 directamente, no se leyeron secretos, no se reintentó ninguna petición y no se ejecutó la matriz completa ni pruebas locales en este avance.
- #57 sigue `open` / `Bloqueado`; BE #49 y su relación formal #45 permanecen intactas. La aceptación independiente y los criterios fuera de estas cuatro lecturas siguen pendientes.
