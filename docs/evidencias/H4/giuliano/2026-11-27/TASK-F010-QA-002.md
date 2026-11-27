# TASK-F010-QA-002 — evidencia de paginación, QA seguridad, 27/11/2026

Issue [Backend #62](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/62), asignada a Giuliano. Se registra evidencia adicional; #62 permanece `open`/`Pendiente`. No cambia DoD, dependencias ni estado y no se atribuye revisión independiente.

## Corte y entorno

- Worktree `/tmp/G1-Marketplace-Backend-qa-f010-security-20261127`; rama `qa/giuliano-f010-security-20261127`.
- Base live `09b3a58a888178db0e56920b281970b4ecd75643`; árbol `f9fe180001c2c63ce98a3d8af57cf95ff201884a`.
- `package-lock.json` SHA-256 `71e577511fdb6bde0a5f4e8ce2da4d215159d11f0a190da702b410fce88ac21b`; dependencias reutilizadas temporalmente desde un worktree aislado con el mismo lockfile, sin modificar manifests.

## Pruebas locales — PASS (MOCK / stubs)

Se amplió la tabla existente de `src/catalog/issue62.spec.ts` con límites de página y tamaño que faltaban en la aserción de no I/O, y se incluyó status 400 junto con `INVALID_PAGE`. No se cambió lógica de producción.

Comando final:

```sh
node_modules/.bin/jest --config /tmp/qa-f010-security-jest.config.cjs --runInBand --runTestsByPath src/catalog/issue62.spec.ts src/catalog/catalog-h4.spec.ts src/catalog/catalog-review.spec.ts src/catalog/catalog.spec.ts
```

Resultado: **4 suites PASS, 94 pruebas PASS, 0 fallos**.

- `issue62.spec.ts`: diez casos inválidos (incluye `pageSize=-1`, `pageSize=0`, `pageSize=49`, `pageSize` sobredimensionado, `page=Infinity`, `page=1e3`, `page=1.5`, `page=-1`, `page=1000001` y `page=9007199254740992`). Todos dan 400 `INVALID_PAGE` antes de `provider.search`; el spy confirma cero llamadas.
- `catalog.spec.ts`: límites válidos e inválidos y overflow de parser, page/pageSize por defecto, vacío válido, códigos seguros ante 401/403/429/500/503; su prueba de timeout usa sólo un servidor fixture loopback.
- `catalog-h4.spec.ts`: adapta `page=1` a página upstream 2, tamaño, total y criterios combinados con fetcher stub; también comprueba páginas inconsistentes como error.
- `catalog-review.spec.ts`: conserva la comprobación de código seguro de timeout y ausencia del detalle privado en el problema público.
- Fetchers de pruebas son stubs/fixtures; no se contactó G6.

Jest con `@swc/jest` terminó antes de ejecutar tests (`Test Suites: 0 of 4`, `Error: Failed to load native binding` en `@swc/core/binding.js:345`). La ejecución final usó el transformer TypeScript temporal validado, que es auxiliar y no una configuración oficial ni un gate CI: `/tmp/qa-f009-ts-transform.cjs`, SHA-256 `5d591b2478f7af2a0749c20df5fba83be232387e1b98e20b1415ad968faf8332`; config `/tmp/qa-f010-security-jest.config.cjs`, SHA-256 `9ed78e9b115ef9ae2b837fbb0cca0d3a772f8120c916ce9680024cc19476d6a8`.

La prueba de timeout de `catalog.spec.ts` abre un servidor propio en `127.0.0.1`; se ejecutó con permiso limitado a loopback. No hubo conexión a hosts externos.

## Evidencia publicada y gates existentes

- **Negativo Render previo — PASS puntual de validación BFF:** el comentario existente en [#62](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/62#issuecomment-7210829290) registra `GET /api/v1/catalog/products?page=-1` el `2026-11-27T03:59:04Z`: HTTP 400 `INVALID_PAGE`, request ID BFF `288b417d-efe8-4513-9f28-301a4b6d883f`, correlacionado en cabecera y cuerpo. No se repitió. Acredita ese rechazo BFF, no continuidad/totales G6, DAST completo ni un error/timeout REAL de G6.
- **Security Gates:** [run 46011923112](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46011923112) reporta Quality Gate/Jest, Semgrep, SCA/npm audit/OSV, licencias y Gitleaks exitosos para el HEAD del run. Alcance limitado a ese workflow/corte; no equivale a aceptación humana ni ausencia global de riesgos.
- **ZAP catálogo local:** [run 46010768202](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46010768202) escaneó loopback sobre `cb31024`, cuyo árbol coincide con el live. El informe de catálogo específico registra 2 Low y 1 Informational, 0 Medium/High **sólo en ese informe**. No certifica el deployment público.

## Clasificación y límites

| Criterio | Estado | Evidencia / límite |
|---|---|---|
| Inputs inválidos/abusivos de `page` y `pageSize` no amplifican provider I/O | PASS | 10 casos de `CatalogService`; status 400 `INVALID_PAGE`, provider spy sin llamadas. |
| Límites válidos y mapeo G1→G6 | PASS (stub) | Conversión zero-based/one-based y pageSize probadas con fetcher fixture; no es proveedor REAL. |
| Error/timeout de proveedor | PASS (stub) | Códigos seguros y detalle privado ausente donde la suite de timeout lo comprueba. |
| Negativo público `page=-1` | PASS puntual | Un HTTP 400 del BFF; no demuestra comportamiento global de G6. |
| Security Gates / ZAP enlazados | PASS dentro del alcance reportado | Sólo los workflows indicados; ZAP se limita al informe local de catálogo. |
| DAST/riesgos y aceptación independiente | BLOCKED | Revisión independiente sigue pendiente; no se hizo DAST de entorno compartido. |
| UI/aceptación FE | BLOCKED | FE #35 sigue `open`/`Pendiente`; no se acredita aceptación de UI publicada. |
| Integración end-to-end | BLOCKED | INT #61 sigue `open`/`Bloqueado`; esta evidencia local no satisface esa dependencia. |

Estados reconsultados el 27/11/2026: FE #35 `open`/`Pendiente`; BE #60 `closed`; OPS #206 `closed`; BE #61 `open`/`Bloqueado`; BE #62 `open`/`Pendiente`. No se modificaron las dependencias.

No se repitió el negativo público, no se llamó G6, no se inyectaron fallos, no se escaneó Render/Vercel y no se ejecutó revisión humana. Esta entrega no declara cero riesgos globales ni cierre de #62.
