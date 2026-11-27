# TASK-F008-QA-002 — evidencia de filtros, QA seguridad, 27/11/2026

Issue [Backend #54](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/54), asignada a Giuliano. Se agrega evidencia de QA sin cambiar DoD, dependencias ni estado. La issue sigue `open`/`Pendiente`; no se atribuye revisión independiente ni aceptación de seguridad.

## Corte y entorno

- Worktree `/tmp/G1-Marketplace-Backend-qa-f008-security-20261127`, rama `qa/giuliano-f008-security-20261127`.
- Base live `09b3a58a888178db0e56920b281970b4ecd75643`, tree `f9fe180001c2c63ce98a3d8af57cf95ff201884a`.
- `package-lock.json` SHA-256 `71e577511fdb6bde0a5f4e8ce2da4d215159d11f0a190da702b410fce88ac21b`; dependencias reutilizadas temporalmente desde el worktree aislado #46 con el mismo lockfile, sin editar manifests.

## Pruebas locales — PASS (MOCK / stubs)

Las pruebas existentes cubren directamente el criterio de no iniciar I/O: `src/catalog/issue54.spec.ts` pasa rangos/filtros inválidos por `CatalogService.search` y comprueba `provider.search` no llamado. No había hueco que justificara añadir tests, así que no se modificó ningún test ni lógica.

Comando que pasó:

```sh
node_modules/.bin/jest --config /tmp/qa-f008-security-jest.config.cjs --runInBand --runTestsByPath src/catalog/issue54.spec.ts src/catalog/catalog-h4.spec.ts
```

Resultado: **2 suites PASS, 28 pruebas PASS, 0 fallos**.

- `issue54.spec.ts` cubre `minPrice=1e2`, `maxPrice=Infinity`, `minPrice=NaN`, precisión `minPrice=0.001`, rango invertido, `brandIds` duplicado y un valor de `categoryIds` con contenido administrativo codificado; en los siete casos `provider.search` no se llama.
- `catalog-h4.spec.ts` confirma códigos de rangos inválidos, rechazo de IDs/filtros ambiguos y validación antes del provider. También comprueba el mapeo de criterios válidos mediante fetcher stub y conserva el precio cero.
- La prueba del provider usa un doble/fixture; no genera tráfico a G6.

Jest estándar con `@swc/jest` no llegó a ejecutar casos: `Test Suites: 0 of 2`, `Tests: 0 of 0`, `Error: Failed to load native binding` desde `@swc/core/binding.js:345`. Para la corrida focal se reutilizó el transformer TypeScript temporal ya validado; **no** es config oficial ni gate CI. Transformer `/tmp/qa-f009-ts-transform.cjs` SHA-256 `5d591b2478f7af2a0749c20df5fba83be232387e1b98e20b1415ad968faf8332`; config `/tmp/qa-f008-security-jest.config.cjs` SHA-256 `1e247a94dd6be65315cf67f5b65fb0c9fd163dc45b5e547c9c44bab33fa03d92`.

## Evidencia de seguridad existente

- **Security Gates — PASS en el workflow enlazado a main:** [run 46011923112](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46011923112): Quality Gate/Jest, Semgrep, SCA/npm audit/OSV, licencias y Gitleaks reportados exitosos. Alcance limitado a ese run/HEAD; no significa que no haya otros riesgos ni equivale a aprobación humana.
- **ZAP local de catálogo — alcance limitado:** [run 46010768202](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46010768202) escaneó loopback sobre `cb31024`, cuyo tree coincide con el live. El informe de catálogo registró 2 Low y 1 Informational, 0 Medium/High **sólo en ese informe**. No acredita DAST de producción o UI ni ausencia global de riesgos.
- **Negativo público previo — PASS puntual de validación BFF:** el comentario existente en [#54](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/54#issuecomment-7210796100) registra `GET /api/v1/catalog/products?minPrice=80&maxPrice=10` a `2026-11-27T03:59:04Z`: HTTP 400 `INVALID_PRICE_RANGE`, request ID BFF `c6625fc4-10d6-4e20-a771-f4f69f51fa48`, correlacionado entre cabecera y cuerpo. Es un negativo puntual del BFF; no es DAST completo, no prueba filtros válidos con datos G6 ni error/timeout REAL de G6. No se repitió tráfico hostil en producción.

## Clasificación y dependencias

| Criterio | Estado | Evidencia / límite |
|---|---|---|
| Rangos/filtros locales inválidos no inician provider I/O | PASS | 7 inputs via `CatalogService.search`, provider spy MOCK sin llamadas. |
| Mapeo de filtros válidos, combinación y precio cero | PASS | Adaptador con fetcher stub; no es tráfico REAL. |
| Negativo público de rango invertido | PASS puntual | Un HTTP 400 `INVALID_PRICE_RANGE` observado en BFF; no equivale a DAST ni a G6 REAL. |
| Gates Security y ZAP enlazados | PASS dentro del alcance publicado | Run 46011923112 y un informe local ZAP 46010768202; resultados no se extrapolan. |
| Revisión independiente DAST/riesgos y aceptación | BLOCKED | ZAP local está disponible; faltan revisión de alcance/riesgos y aceptación independiente. |
| UI / integración de filtros | BLOCKED | FE #31 sigue `open`/`Pendiente`; el FE main/deploy reportado es `1f02acc128b0eb4dc200c6519811b41ee6b551c1` y el retest UI devolvió 503. |
| Integración con proveedor | BLOCKED | #53 sigue `open`/`Bloqueado`; esta tarea no prueba las operaciones de G6. |

Estados reconsultados el 27/11/2026: FE #31 `open`/`Pendiente`; BE #52 `closed`; OPS #206 `closed`; BE #53 `open`/`Bloqueado`; BE #54 `open`/`Pendiente`. No se modificaron esas issues.

No se llamó directamente a G6, no se reintentó la URL pública, no se inyectaron fallos, no se escaneó Render/Vercel y no se ejecutó revisión humana. Esta entrega no declara cero riesgos globales ni cierre de #54.
