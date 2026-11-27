# TASK-F009-QA-002 — evidencia de seguridad QA, 27/11/2026

Issue [Backend #58](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/58). Se agrega evidencia y una aserción focal en pruebas existentes. La issue sigue `open`, estado de origen `Pendiente`; no se cambia su DoD, dependencias ni estado. No se atribuye revisión independiente ni aceptación de seguridad.

## Corte y ejecución

- Worktree: `/tmp/G1-Marketplace-Backend-qa-f009-security-20261127`; rama `qa/giuliano-f009-security-20261127`.
- Base live: `09b3a58a888178db0e56920b281970b4ecd75643`; árbol `f9fe180001c2c63ce98a3d8af57cf95ff201884a`.
- `package-lock.json` SHA-256: `71e577511fdb6bde0a5f4e8ce2da4d215159d11f0a190da702b410fce88ac21b`; se reutilizó temporalmente el `node_modules` de QA anterior con ese mismo lockfile, sin editar dependencias.
- Para la prueba focal se usó un transformer TypeScript temporal porque esta corrida reutilizó el workaround del caché nativo SWC del entorno. No es la configuración oficial del repo ni un gate CI. Transformer `/tmp/qa-f009-ts-transform.cjs`, SHA-256 `5d591b2478f7af2a0749c20df5fba83be232387e1b98e20b1415ad968faf8332`; config `/tmp/qa-f009-security-jest.config.cjs`, SHA-256 `bfba6559a75d1ad10841688d295c286fb1393922c5b675ac6fe6513efee5bea7`.

## Prueba focal — PASS (MOCK)

Se encontró un hueco de aserción: la prueba existente rechazaba los valores al parsearlos, pero no verificaba directamente que `CatalogService` no invocara `provider.search`. Se ajustó el test existente en `src/catalog/issue58.spec.ts`; no se añadieron casos ni se cambió lógica de producción.

Comando ejecutado:

```sh
node_modules/.bin/jest --config /tmp/qa-f009-security-jest.config.cjs --runInBand --runTestsByPath src/catalog/issue58.spec.ts
```

Resultado: **1 suite PASS, 5 pruebas PASS, 0 fallos**.

Cuatro variantes se prueban a través de `CatalogService.search` con spy de `provider.search`; todas responden 400 y el spy permanece sin llamadas:

- `sort=__proto__` → `INVALID_SORT`.
- `sort=NAME_ASC&sort=NAME_DESC` → `INVALID_PARAMETERS` por clave duplicada.
- `sort=NOMBRE_ASC` → `INVALID_SORT`.
- `sort=NAME_ASC%26estado%3DINACTIVO` → `INVALID_SORT`; el contenido codificado no se acepta como valor de sort.

El quinto caso usa un fetcher stub que devuelve 429 para una consulta válida ordenada; el adaptador produce `CATALOG_UNAVAILABLE` 503 en vez de éxito parcial ordenado localmente. Es un stub, no un error REAL de G6.

El corte previo [TASK-F009-INT-001 en #57](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/b953202b02d75f03c6f66e3429afad64c8f0451e/docs/evidencias/H4/giuliano/2026-11-27/TASK-F009-INT-001.md) registró 5 suites/50 pruebas PASS sobre el mismo SHA live, incluida la versión anterior de `issue58.spec.ts`. Esta rama reejecutó la suite focal después de añadir la comprobación de no invocación.

## Evidencia existente de seguridad

- **Security Gates — PASS en el corte main enlazado:** [workflow 46011923112](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46011923112), con Quality Gate Jest y los jobs Semgrep, SCA/OSV, licencias y Gitleaks reportados exitosos. Esos gates pertenecen a ese workflow/HEAD; no son aceptación humana ni eliminan riesgos fuera de su alcance.
- **ZAP catálogo local — alcance limitado:** [workflow 46010768202](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46010768202) escaneó loopback sobre commit `cb31024`, cuyo árbol coincide con el live (`f9fe180...`). Su informe de catálogo reportó 2 Low y 1 Informational, 0 Medium/High **sólo para ese informe**. No representa DAST del deployment público ni ausencia global de riesgos.
- **Negativo público previo — PASS puntual de validación BFF:** el comentario existente en [#58](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/58#issuecomment-7210811774) registra `GET /api/v1/catalog/products?sort=TITLE` a `2026-11-27T03:59:04Z`: HTTP 400 `INVALID_SORT`, request ID BFF `ed25b854-1e56-48b6-a69b-b23208cfe2ae`, correlacionado entre cabecera y cuerpo. Es una muestra de rechazo de valor fuera de contrato; no es DAST completo, no prueba inyección en producción y no es una prueba REAL de G6. No se repitió tráfico hostil ni se sondeó la URL pública en esta tarea.

## Clasificación, dependencias y límites

| Criterio | Estado | Evidencia / límite |
|---|---|---|
| Rechazo local de valores desconocidos/duplicados/injection-shaped antes del provider | PASS | Test MOCK de `CatalogService`; 4 entradas y `provider.search` no llamado. |
| Manejo del 429 upstream | PASS (stub) | 503 fail-closed en un fetcher controlado; no tráfico externo. |
| Rechazo público `sort=TITLE` | PASS puntual | Sólo un 400/`INVALID_SORT` observado en Render BFF; no acredita DAST ni G6. |
| Security Gates / ZAP enlazados | PASS dentro del alcance publicado | Sólo el workflow 46011923112 y el informe local ZAP 46010768202; resultados no se generalizan. |
| Revisión independiente del alcance/riesgos y aceptación de seguridad | BLOCKED | El ZAP local está enlazado; su alcance y riesgos siguen por revisar. No hubo escaneo nuevo ni aceptación independiente. |
| Integración UI end-to-end | BLOCKED | FE #33 sigue abierta/Pendiente; el FE main/deploy reportado es `1f02acc128b0eb4dc200c6519811b41ee6b551c1` y el retest UI devolvió 503. No se modificó FE. |

Estados reconsultados el 27/11/2026: FE #33 `open`/`Pendiente`; BE #56 `closed`; OPS #206 `closed`; BE #57 `open`/`Bloqueado`; BE #58 `open`/`Pendiente`. No se modificaron ni cerraron esas issues.

Esta evidencia no declara cero riesgos globales ni cierre de #58. No hubo llamada directa a G6, tráfico hostil/injection hacia producción, DAST de Render/Vercel, revisión humana ni cambio en lógica de producción.
