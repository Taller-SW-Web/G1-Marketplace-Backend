# TASK-F007-QA-002 — evidencia de búsqueda, QA seguridad, 27/11/2026

Issue [Backend #50](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/50), asignada a Giuliano. Este informe añade comprobaciones locales y evidencia con su alcance. #50 permanece `open`/`Pendiente`; no se cambia DoD, dependencias ni estado, y no se atribuye revisión independiente.

## Corte y entorno

- Worktree `/tmp/G1-Marketplace-Backend-qa-f007-security-20261127`; rama `qa/giuliano-f007-security-20261127`.
- Base live `09b3a58a888178db0e56920b281970b4ecd75643`; tree `f9fe180001c2c63ce98a3d8af57cf95ff201884a`.
- `package-lock.json` SHA-256 `71e577511fdb6bde0a5f4e8ce2da4d215159d11f0a190da702b410fce88ac21b`; dependencias del mismo lockfile reutilizadas temporalmente desde worktree aislado, sin editar manifests.

## Pruebas focales — PASS (MOCK / stubs)

Se encontró una brecha focal: había pruebas de longitud sobre `parseQuery`, pero no una aserción a través de `CatalogService` que comprobara que una búsqueda de 121 caracteres no llegaba al provider; el test 403 tampoco verificaba status ni contenido seguro de la respuesta pública. Se ampliaron únicamente los tests existentes de `src/catalog/issue50.spec.ts`; no se cambió lógica de producción.

Comando final que pasó:

```sh
node_modules/.bin/jest --config /tmp/qa-f007-security-jest.config.cjs --runInBand --runTestsByPath src/catalog/issue50.spec.ts src/catalog/catalog-review.spec.ts src/catalog/catalog.spec.ts
```

Resultado: **3 suites PASS, 69 pruebas PASS, 0 fallos**.

- `issue50.spec.ts`: `q` de 121 caracteres responde `INVALID_SEARCH_QUERY`/400 vía `CatalogService.search`; un spy confirma que `provider.search` no se llama.
- El query sintético `polo&estado=INACTIVO`, pasado como valor codificado, permanece en el parámetro `q` del adaptador; el URL construido no crea un parámetro `estado`. El fetch es un stub local, sin llamada a G6.
- El stub 403 contiene la cadena sintética `private upstream token detail`; el adaptador devuelve `CATALOG_UNAVAILABLE`/503 con diagnóstico `PROVIDER_HTTP_403`. El test comprueba que la cadena no aparece en el error ni en el sobre público `problem`.
- `catalog-review.spec.ts` mantiene la comprobación de timeout/código seguro sin filtrar el detalle privado.
- `catalog.spec.ts` cubre límites 1/2/120/121, normalización/consulta vacía, proyección de campos públicos y códigos seguros para respuestas de proveedor. La prueba de timeout usa un servidor fixture propio en `127.0.0.1`.

El primer intento de Jest con `@swc/jest` se detuvo antes de correr casos (`Test Suites: 0 of 3`, `Error: Failed to load native binding` en `@swc/core/binding.js:345`). Se usó el transformer TypeScript temporal validado: `/tmp/qa-f009-ts-transform.cjs`, SHA-256 `5d591b2478f7af2a0749c20df5fba83be232387e1b98e20b1415ad968faf8332`; config `/tmp/qa-f007-security-jest.config.cjs`, SHA-256 `09be4eda75b876c002a4ba206cfad55eb2d145975d61b0f77ce866514c4bcd99`. No es configuración oficial ni gate CI.

El listener de `catalog.spec.ts` produjo `listen EPERM` en el primer intento sandboxed. Reejecuté esa suite y luego las tres suites bajo permiso limitado al listener local `127.0.0.1`; no hubo tráfico externo ni contacto a G6. El conjunto final anterior corresponde a esa ejecución.

## Evidencia previa y gates

- **Negativo público puntual:** el comentario existente en [#50](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/50#issuecomment-7210779112) registra `GET /api/v1/catalog/products?q=[cadena de 121 caracteres]` en Render a `2026-11-27T03:59:03Z`: HTTP 400 `INVALID_SEARCH_QUERY`, request ID BFF `be5fc3f9-dc2b-43d4-ba49-ff229ecdd5ae`, correlacionado entre cabecera y cuerpo. Esto acredita un rechazo de longitud en BFF; no es DAST completo, no demuestra inyección en producción ni prueba error/timeout REAL de G6. No se repitió ni se envió una consulta hostil a producción.
- **Security Gates:** [run 46011923112](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46011923112) reporta Quality Gate/Jest, Semgrep, SCA/npm audit/OSV, licencias y Gitleaks exitosos para el HEAD del run. Es evidencia de esos gates/ese corte, no aceptación humana ni ausencia global de riesgo.
- **ZAP de catálogo local:** [run 46010768202](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46010768202) escaneó loopback sobre `cb31024`, tree igual al live. El informe específico de catálogo contiene 2 Low y 1 Informational, 0 Medium/High **sólo en ese informe**. No certifica DAST del deployment público.

## Clasificación, dependencias y límites

| Criterio | Estado | Evidencia / límite |
|---|---|---|
| Rechazo de longitud antes de provider I/O | PASS | 121 caracteres → 400 `INVALID_SEARCH_QUERY`; spy del provider sin llamadas. |
| Query con separadores codificados no inyecta otro parámetro | PASS (stub) | Valor se conserva en un único `q`; no se contacta el servicio externo. |
| Error 403 del provider no filtra cuerpo privado | PASS (stub) | 503 `CATALOG_UNAVAILABLE`; cadena sintética ausente del error y del problema público. |
| Negativo publicado de Render | PASS puntual | Un rechazo público por longitud; no es DAST completo ni resultado de G6. |
| Security Gates / ZAP enlazados | PASS dentro del alcance reportado | Sólo esos workflows y el informe local indicado; no se extrapola. |
| Revisión independiente DAST/riesgos y aceptación | BLOCKED | Pendientes según DoD; no se hizo DAST público ni revisión humana. |
| Aceptación FE / UI publicada | BLOCKED | #29 sigue `open`/`En revisión`; no se acredita el corte FE publicado desde esta tarea. |
| Integración de búsqueda | BLOCKED | #49 sigue `open`/`Bloqueado`; este trabajo no cambia ni satisface esa dependencia formal. |

Dependencias reconsultadas el 27/11/2026: FE #29 `open`/`En revisión`; BE #48 `closed` (el texto histórico de su cuerpo conserva una nota de revisión); OPS #201 `closed`; BE #49 `open`/`Bloqueado`; BE #50 `open`/`Pendiente`. No se modificó ninguna.

No se llamó directamente a G6, no se usaron secretos reales, no se envió inyección a producción y no se escanearon Render/Vercel. Esta entrega no declara cero riesgos globales ni cierre de #50.
