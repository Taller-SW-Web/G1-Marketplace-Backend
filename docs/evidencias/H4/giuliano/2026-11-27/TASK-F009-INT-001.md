# TASK-F009-INT-001 — evidencia adicional de integración, 27/11/2026

Issue [Backend #57](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/57). Se agrega evidencia propia de QA; no cambia el DoD, dependencias, asignación ni estado. La issue sigue `open`, con estado de origen `Bloqueado`. No se atribuye revisión independiente ni aceptación.

## Corte y entorno

- Corte live usado como base: `09b3a58a888178db0e56920b281970b4ecd75643`; árbol: `f9fe180001c2c63ce98a3d8af57cf95ff201884a`.
- Worktree: `/tmp/G1-Marketplace-Backend-qa-f009-int-20261127`; rama: `qa/giuliano-f009-int-20261127`.
- Las comprobaciones locales usan el código de ese corte. El `package-lock.json` conserva SHA-256 `71e577511fdb6bde0a5f4e8ce2da4d215159d11f0a190da702b410fce88ac21b`; se reutilizaron dependencias ya instaladas con ese lockfile mediante symlink temporal, sin editar `package.json` ni el lockfile.
- Jest se ejecutó con transformer TypeScript temporal porque el caché nativo de SWC observado en esta máquina no es utilizable. Transformer `/tmp/qa-f009-ts-transform.cjs`, SHA-256 `5d591b2478f7af2a0749c20df5fba83be232387e1b98e20b1415ad968faf8332`; config `/tmp/qa-f009-jest.config.cjs`, SHA-256 `24fc845fa75dd1389bb6bfbed6b677ea54b3ebf030f22684b95bddfc5ea74af0`.

## Pruebas locales — PASS (MOCK / stubs)

Comando:

```sh
node_modules/.bin/jest --config /tmp/qa-f009-jest.config.cjs --runInBand --runTestsByPath src/catalog/catalog-tie-order.spec.ts src/catalog/catalog-h4.spec.ts src/catalog/catalog-review.spec.ts src/catalog/issue56.spec.ts src/catalog/issue58.spec.ts
```

Resultado: **5 suites PASS, 50 pruebas PASS, 0 fallos**.

- `catalog-tie-order.spec.ts`: fixture MOCK conserva `productId ASC` para nombres iguales en `NAME_ASC` y `NAME_DESC`, incluso al combinar tres páginas.
- `catalog-h4.spec.ts` y `catalog-review.spec.ts`: stubs verifican la traducción `NAME_ASC` → `NOMBRE_ASC`, paginación/metadatos, validaciones y respuestas de error/timeout del adaptador.
- `issue56.spec.ts` y `issue58.spec.ts`: pruebas locales de rechazo de orden inválido o todavía no publicado.

Estos casos no llaman G6 ni prueban el corte desplegado del proveedor. Los casos llamados `REAL` en unit tests usan fetchers stub y credenciales sintéticas, no secretos.

## Observaciones de despliegue

**Positivo específico previo — PASS, muestra observada, sin garantía global.** En la lectura Render BFF reportada el `2026-11-27T14:13:10.395567Z`: `GET /api/v1/catalog/products?page=0&pageSize=2&sort=NAME_ASC` devolvió HTTP 200, `X-Catalog-Source: REAL` y `X-Request-Id: 3048201d-2647-47a2-bacb-094223d2cbd3`. Los dos productos homónimos `G6 QA Marketplace Desempate` aparecieron en orden 002 (`8ad24563-c9da-4305-b650-1dd47a14fffb`) → 001 (`93f7f500-077d-432e-be98-31cb9ee0d66d`), compatible con ID ascendente. Es una muestra REAL comunicada por root y conservada en [Frontend #34](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/34#issuecomment-7221131044); no acredita la garantía global de G6 ni continuidad entre páginas en todo el dataset.

**Errores previos — BLOCKED para atribución causal.** La traza de [Frontend #34](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/34#issuecomment-7221131044) registra Vercel proxy HTTP 503 `CATALOG_UNAVAILABLE` a `2026-11-27T14:33:16.750719Z`, request ID BFF `36a4a706-27db-4f80-bf28-43409ddb43cc`, y Render BFF HTTP 503 a las `2026-11-27T14:33:48Z`, fuente `REAL`, request ID BFF `c48a79d5-d0b6-48de-9d65-7855604caaae`. Logs Render relacionaron ambas solicitudes con `PROVIDER_HTTP_403`; no determinan la causa del 403. No se infiere falla ni corrección en G6.

**Una lectura actual adicional — PASS de respuesta genérica BFF/REAL; empate INCONCLUSIVE.** A las `2026-11-27T15:20:29Z`, una única lectura sin credenciales a Render BFF, `GET /api/v1/catalog/products?page=0&pageSize=2&sort=NAME_ASC`, respondió HTTP 200 con `X-Catalog-Source: REAL`, `X-Request-Id: 10760a25-7910-4eb0-b4ea-b42d4dbe79d8` y `page={number:0,size:2,totalElements:49,totalPages:25}`. La página contenía `adidas adi 23` y `adidas Copa Pure 2 League FG`, no el query `q=G6 QA Marketplace Desempate` ni el par de homónimos. Por ello es una respuesta genérica posterior a las muestras 503; no revalida el desempate ni prueba que el proveedor recuperó por una causa concreta.

`X-Request-Id` es el identificador del BFF. No se observó en esta respuesta un `correlationId` emitido/devuelto por G6 ni se consultaron sus logs. Para las muestras de 14:33, la relación con `PROVIDER_HTTP_403` proviene de los logs Render ya reportados en #34, sin causa determinada.

## Clasificación y límites

| Criterio | Estado | Evidencia / límite |
|---|---|---|
| Orden MOCK estable por ID en empate, ambas direcciones y páginas | PASS | Fixture local; no garantiza el proveedor externo. |
| Mapeo de sort y validación local | PASS | Adaptador con stubs; no es tráfico REAL. |
| Lectura REAL de listado genérico posterior a las muestras 503 | PASS | Un HTTP 200 observado en Render BFF; no se consultó Vercel ni se repitió la lectura. |
| Ejemplo REAL específico de desempate | PASS — muestra | 14:13:10Z observó 002 → 001; no prueba estabilidad global ni continuidad de todas las páginas. |
| Repetición actual del caso homónimo / correlación G6 | INCONCLUSIVE | La lectura única actual no incluyó el nombre de prueba; no se obtuvo `correlationId` de G6. |
| Cierre de #57 / aceptación end-to-end | BLOCKED | Persisten I-01, evidencia integral y dependencias; no hubo revisión independiente. |

No se llamó a G6 directamente, no se usaron secretos, no se provocaron fallos y no se repitió ante error. Tampoco se ejecutaron despliegues, build completo, typecheck ni una suite integral.

## Dependencias reconsultadas el 27/11/2026

- #56: `closed`.
- #49: `open`, estado de origen `Bloqueado`; mantiene la dependencia formal a #45. Su comentario aclara que el ranking G5 fuera de H5 no bloquea el alcance F-007, pero no elimina esa dependencia formal.
- #45: `open`, estado de origen `Bloqueado` por I-01 y selección editorial.
- #57 permanece `open`, estado de origen `Bloqueado`. No se modificó ni reabrió ninguna issue.
