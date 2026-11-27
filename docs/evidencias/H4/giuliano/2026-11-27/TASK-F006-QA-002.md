# TASK-F006-QA-002 — evidencia local de seguridad (2026-11-27)

Registro adicional para la issue [Backend #46](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/46). La issue sigue abierta, asignada a Giuliano y con estado de origen **Pendiente**. Este registro no cambia su DoD ni representa una revisión humana independiente.

## Corte y comandos

- Corte evaluado: Backend `main` `09b3a58a888178db0e56920b281970b4ecd75643`, árbol `f9fe180001c2c63ce98a3d8af57cf95ff201884a`.
- Worktree: `/tmp/G1-Marketplace-Backend-qa-f006-security-20261127`, rama `qa/giuliano-f006-security-20261127`, creado desde ese SHA.
- `package-lock.json` SHA-256: `71e577511fdb6bde0a5f4e8ce2da4d215159d11f0a190da702b410fce88ac21b`.
- `npm ci --offline --no-audit --no-fund --cache /tmp/npm-cache-g1-f006`: no pudo resolver desde caché `amqplib@2.4.2` (`ENOTCACHED`).
- `npm ci --no-audit --no-fund --cache /tmp/npm-cache-g1-f006`: **PASS**, instaló 636 paquetes en el worktree aislado.
- El Jest local configurado con `@swc/jest` quedó **BLOCKED** por `ERR_SWC_NATIVE_CACHE`: el addon rechazó las raíces disponibles en `/tmp` y `/home` por permisos de sus ancestros. No se cambió la configuración del proyecto.
- Como evidencia auxiliar, se ejecutaron las mismas suites con `typescript.transpileModule` desde una configuración temporal fuera del repositorio. Config `/tmp/qa-f006-jest.config.cjs`, SHA-256 `3dfbafd4a0caef1d226723d2601f64e4b333403270b273ced8b5c91f8a86a936`; transformer `/tmp/qa-f006-ts-transform.cjs`, SHA-256 `5d591b2478f7af2a0749c20df5fba83be232387e1b98e20b1415ad968faf8332`.

```sh
node_modules/.bin/jest --config /tmp/qa-f006-jest.config.cjs --runInBand --runTestsByPath \
  src/catalog/issue46.spec.ts \
  src/catalog/featured-security.spec.ts \
  src/catalog/featured.spec.ts \
  src/catalog/catalog-review.spec.ts
```

**Resultado auxiliar: 4 suites PASS, 46 tests PASS, 0 fallos.** Los fixtures son sintéticos y locales. El gate oficial de cobertura Jest también pasó en CI para el SHA exacto de `main` (ver run de Security Gates abajo); el fallback de TypeScript se conserva únicamente para documentar la ejecución local bajo esta restricción del addon.

## Resultado por criterio

| Criterio | Estado | Evidencia y alcance |
| --- | --- | --- |
| Producto inactivo no publicable | **PASS** | `issue46.spec.ts` rechaza el producto `INACTIVO`; `featured.spec.ts` verifica que Home lo omite. Las suites son locales y usan proveedor/datos sintéticos. |
| Medios con allowlist | **PASS** | `issue46.spec.ts` rechaza host con sufijo engañoso, URL con credenciales, HTTP y `javascript:`. `featured-security.spec.ts` verifica que `home()` rechaza una imagen presente cuyo host no está aprobado, sin reemplazarla silenciosamente. |
| Enlace seguro de tarjetas / “hero” | **INCONCLUSIVE** | El DTO Backend expone `slug`, no un `href` de hero. El slug se restringe a minúsculas, dígitos y guiones, máximo 120; `featured.spec.ts` omite `../private`. En la lectura FE, el CTA de portada apunta a `/catalogo` y ProductCard codifica el slug en `/productos/{slug}`; no se ejecutó ni aceptó end-to-end. FE #27 sigue abierta y **En revisión**, por lo que este registro no acredita aceptación FE ni despliegue. |
| Negativo `GET /api/v1/catalog/home?q=polo` | **PASS** para este negativo puntual | `catalog-review.spec.ts` verifica que `q=polo` se rechaza antes de llamar al proveedor. El comentario previo de #46 registra además el HTTP 400 `INVALID_PARAMETERS` en Render. Este caso no equivale a DAST completo ni prueba G6. |
| Security Gates: SAST, SCA y secret scan | **PASS** del gate automatizado configurado | En `main` exacto, run [46011923112](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46011923112) terminó `success`. Artefactos: `backend-semgrep-sarif` (15204437733), `backend-sca-licenses-reports` (15203963400), `backend-gitleaks-sarif` (15203019155) y `backend-coverage-report` (15203783615). Esto acredita la ejecución y sus umbrales del workflow, no ausencia global de riesgos ni aceptación humana de hallazgos no bloqueantes. |
| OWASP ZAP local / loopback | **PASS** de ejecución y archivo | Run [46010768202](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/46010768202), sobre `develop` `cb31024b25450bc15a26787daa7ce2d2f5a4c2eb`, terminó `success`; su árbol coincide con el árbol de `main` indicado arriba. Artefacto `backend-owasp-zap-dast-report` (15204332142). El informe de catálogo de loopback registrado para este corte tiene 2 alertas Low (error response y `X-Powered-By`), 1 Informational (`Non-Storable Content`) y 0 Medium/High **sólo para ese informe**; no se extiende el conteo a otros informes. |
| Revisión independiente del DAST y sus riesgos | **BLOCKED** | Sigue pendiente de Andrés/seguridad. No se atribuye revisión o aceptación a esta ejecución automatizada. |
| G6 REAL: provocar 503/timeout | **BLOCKED** | No hay ventana controlada; no se provocaron fallos ni se escanearon Render/Vercel/APIM compartidos. El DAST `openapi-catalogo-h4` importa el contrato local, que contiene `/api/v1/catalog/home`, `/api/v1/catalog/filters` y `/api/v1/catalog/products`; no certifica el despliegue público ni la integración REAL de G6. |
| Trivy / SBOM final del corte | **INCONCLUSIVE** | No se localizó un artefacto final Trivy/SBOM asociado a este corte. No se infiere que el escaneo no exista en otro lugar. |
| Aceptación integrada/desplegada | **BLOCKED** | FE #27 está abierta y en revisión; Backend #45 (integración) está abierta. Backend #44 y OPS #201 están cerradas. No se modificaron esas issues ni se probó un despliegue. |

No se identificó un fallo de aserciones entre las 46 pruebas ejecutadas. La revisión de riesgos, el DAST independiente, el negativo real de G6 y la aceptación desplegada siguen fuera de la evidencia local. No se afirma cero riesgos globales ni se cierra la issue #46.
