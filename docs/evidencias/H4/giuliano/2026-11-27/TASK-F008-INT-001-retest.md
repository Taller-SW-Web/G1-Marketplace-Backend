# TASK-F008-INT-001 — evidencia de integración de búsqueda con rango

Fecha: 2026-11-27 (UTC). Backend #53 permanece `open` / `Bloqueado`.

## Estado y dependencias

- Preflight indicado para esta tarea: #53 `open` / `Bloqueado`; BE #52 `closed`; OPS/I-01 #200 `closed`; dependencia formal BE #49 `open` / `Bloqueado`. No se editaron otras issues ni estados.
- La dependencia formal #49 y sus criterios restantes continúan bloqueando el cierre de #53. Esta nota registra un resultado de integración limitado; no declara homologación ni cierre.

## Evidencia relacionada

- FE #32 documenta la petición combinada de búsqueda y rango en [su artefacto, commit `eb03839`](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/eb03839fd78e4fb090604e08d1b7445916d8146a/docs/evidencias/H4/giuliano/2026-11-27/TASK-F008-QA-001-search-price-retest.md). A `2026-11-27T16:47:30Z`, la única lectura al BFF respondió HTTP 503 `CATALOG_TIMEOUT`, `X-Catalog-Source: REAL`, BFF `X-Request-Id: b8591908-de44-4431-8241-08c148ca813f`. La respuesta no incluyó productos, precios ni total.
- Según la inspección independiente de logs Render informada por root, ese mismo request ID correlaciona con `diagnostic=PROVIDER_TIMEOUT`, status 503 y duración `15234 ms`. El diagnóstico no identifica una causa aguas arriba ni demuestra qué productos/precios habría devuelto G6.
- El backend live en ese momento era SHA `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f`; el deploy posterior `bcac2f6...` figuraba `update_failed`.
- BE #49 contiene evidencia previa de búsqueda positiva sin rango en [commit `bafb418`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/bafb418721c77ae85c77363f9104f3beddf3f433). Esa respuesta 200 para `q` sin filtros no acredita la combinación con precio; sus requests no se repitieron.

## Datos esperados y límites

G6 proporcionó para esta comprobación los siguientes datos: los dos productos están activos, ambos son de categoría Balones y marca Nike; `ord-001` (`93f7f500-077d-432e-be98-31cb9ee0d66d`) cuesta S/39.90 y `ord-002` (`8ad24563-c9da-4305-b650-1dd47a14fffb`) cuesta S/49.90. Para el filtro S/40–50 se esperaba sólo `ord-002`, total 1. Estos valores son datos suministrados para la prueba; la respuesta 503 no los revalidó.

| Criterio acotado | Resultado |
| --- | --- |
| Búsqueda positiva `q` sin filtros, según evidencia previa #49 | **PASS para ese caso únicamente** |
| Búsqueda `q` combinada con precio 40–50, en BFF REAL | **BLOCKED: HTTP 503 `CATALOG_TIMEOUT`** |
| IDs, precios y total del resultado combinado | **NOT OBSERVED** |
| Causa aguas arriba, correlationId/version de G6 | **NOT ESTABLISHED / NOT EXPOSED** |

El request ID disponible es del BFF; no se inventa ni se atribuye correlationId a G6. No se llamó directamente a G6, no se hicieron requests adicionales al BFF/G6 ni reintentos, y no se ejecutaron pruebas locales. No se afirma que el filtro de precio esté homologado.

## Corte y alcance del cambio

- Worktree aislado: `/tmp/G1-Marketplace-Backend-f008-integration-20261127`, rama `integration/giuliano-f008-timeout-20261127`, basada en el SHA live `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f`.
- Este commit añade sólo esta nota de evidencia. #53 sigue `open` / `Bloqueado` por la dependencia formal #49 y los criterios restantes; no se cambió estado ni labels.
