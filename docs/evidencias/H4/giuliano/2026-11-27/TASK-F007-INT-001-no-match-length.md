# TASK-F007-INT-001 — consulta sin coincidencias y límite de longitud

**Fecha:** 2026-11-27 UTC
**Issue:** [Backend #49](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/49), que permanece `open / Bloqueado`.

## Corte y dependencias

Render confirmó `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f` como SHA `live` a las 17:30:22 UTC, justo antes de la lectura. La rama documental se basa en ese SHA live. La respuesta recibida indicó `X-Render-Origin-Server: Render`.

Estado consultado: #48 está `closed` con estado de origen `En revisión`; OPS/I-01 #200 está `closed`; la dependencia formal de ranking G5, [#45](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/45), sigue `open / Bloqueado`. #48 y #45 no se modifican. La búsqueda positiva ya publicada para #49 se conserva en [commit `bafb418`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/bafb418721c77ae85c77363f9104f3beddf3f433); este artefacto añade sólo el caso de consulta sin coincidencias y el resultado de inspección del límite.

## Búsqueda sin coincidencias — GET realizado

- Inicio de petición: **2026-11-27 17:30:22 UTC**; `Date` HTTP: **17:30:28 UTC**.
- Solicitud sanitizada: `GET /api/v1/catalog/products?q=giuliano-control-no-match-20261127&page=0&pageSize=2` (sin `sort`).
- Resultado: **HTTP 200**, `X-Catalog-Source: REAL`, `sort: null`, `data: []`, `page.number=0`, `page.size=2`, `totalElements=0`, `totalPages=0`.
- `X-Request-Id`: `82681cc5-18ea-4d0d-8cf4-f8c45a34e21a` (ID del BFF).
- No se expusieron version/correlation ID de G6. No se consultaron logs; por eso no se afirma si hubo una llamada upstream.

## Límite de 121 caracteres — no enviado

Se inspeccionó el código de `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f` antes de considerar la segunda solicitud:

- `src/catalog/query.ts` permite una búsqueda no vacía de 2 a 120 caracteres y, al exceder 120, lanza `CatalogError("INVALID_SEARCH_QUERY", 400)`.
- `src/catalog/errors.ts` conserva el código público `INVALID_SEARCH_QUERY`; no hay traducción a `INVALID_SEARCH`.
- `src/catalog/catalog.service.ts` evalúa `parseQuery(params)` antes de invocar `provider.search(...)`.

Por la discrepancia entre el código que realmente especifica el corte (`INVALID_SEARCH_QUERY`) y el código esperado en la instrucción (`INVALID_SEARCH`), **no se envió** el GET de 121 caracteres. No existe resultado HTTP ni observación de logs para ese caso en este avance. La inspección del flujo local indica que la validación ocurre antes del provider, pero esto no se presenta como resultado runtime.

## Resultado y límites

- **PASS:** La consulta de control sin coincidencias devolvió HTTP 200/REAL y total cero en el corte consultado.
- **NOT RUN:** El GET de 121 caracteres no se ejecutó por la diferencia del código de error previsto. No se inventa ni se atribuye un resultado de proveedor.
- El negativo público previo de longitud de búsqueda y la prueba positiva de [commit `bafb418`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/bafb418721c77ae85c77363f9104f3beddf3f433) son evidencias separadas; no se repitieron.
- La dependencia #45 y la evidencia de timeout/error controlado siguen pendientes. No se hizo prueba UI, no se llamó directamente a G6 y no se inyectó timeout ni fallo.

#49 queda abierta/bloqueada por sus dependencias y criterios restantes. No se cambiaron labels, DoD ni estado. Se ejecutó exactamente un GET al BFF y no se ejecutaron suites locales.
