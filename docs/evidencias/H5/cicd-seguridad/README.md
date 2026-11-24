# Paquete de Evidencia CI/CD y Seguridad — Hito 5 (`TASK-H5-CICD-010` / Issue #290)

**Responsable:** Andres Morales (`@andreus710`)  
**Revisor:** Leonidas Garcia (`@LeonidasGarcia`)  
**Fecha de corte:** 2026-11-24  
**Presentación H5:** 2026-11-28

---

## 1. Mapa de Controles CI/CD, DevSecOps, APIM y Performance

| Issue | ID Tarea | Control implementado | Artefacto / Workflow en repo | Estado |
| :--- | :--- | :--- | :--- | :---: |
| **#282** | `TASK-H5-CICD-001` | Pipeline unificado Backend (11 etapas + PostgreSQL 16 + aprobación `production`) | [`.github/workflows/cicd.yml`](../../../../.github/workflows/cicd.yml) | Implementado (`5ec7abe`) |
| **#283** | `TASK-H5-CICD-003` | Gate SAST (Semgrep + SARIF) y Secret Scan (Gitleaks código + historial + SARIF) | [`.github/workflows/security-gates.yml`](../../../../.github/workflows/security-gates.yml), [`.gitleaksignore`](../../../../.gitleaksignore) | Fusionado en `develop` (`v1.12.0`) |
| **#284** | `TASK-H5-CICD-004` | Gate SCA (`npm audit` + OSV-Scanner CVSS ≥ 7.0), licencias (`0 UNKNOWN`) y Dependabot | [`.github/dependabot.yml`](../../../../.github/dependabot.yml), [`scripts/check-licenses.mjs`](../../../../scripts/check-licenses.mjs) | Fusionado en `develop` (`v1.12.0`) |
| **#285** | `TASK-H5-CICD-005` | Trivy (`Dockerfile` + imagen Docker) + SBOM CycloneDX adjunto al GitHub Release | [`.github/workflows/cicd.yml`](../../../../.github/workflows/cicd.yml) (`container-security`, `docker-image`) | Implementado (`2f56903`) |
| **#286** | `TASK-H5-CICD-006` | DAST OWASP ZAP Baseline contra staging propio con reportes HTML/JSON/MD archivados | [`.github/workflows/dast-zap.yml`](../../../../.github/workflows/dast-zap.yml), [`.zap/rules.tsv`](../../../../.zap/rules.tsv) | Implementado (`04f1e5b`) |
| **#287** | `TASK-H5-CICD-007` | Quality Gates: umbrales de cobertura contra línea base (`66/63/64/69`) + bloqueo vulns altas/críticas | [`jest.config.js`](../../../../jest.config.js), [`.github/workflows/security-gates.yml`](../../../../.github/workflows/security-gates.yml) | Fusionado en `develop` (`v1.12.0`) |
| **#290** | `TASK-H5-CICD-010` | Ciclo `hallazgo → ticket → corrección → retest` y paquete de evidencia | [`ciclo-hallazgo-correccion-retest.md`](./ciclo-hallazgo-correccion-retest.md) | Implementado |
| **#303** | `TASK-H5-PERF-004` | Smoke de performance en CI con umbrales bloqueantes (`p95 ≤ 1500 ms`, `error ≤ 1%`) | [`scripts/perf-smoke.mjs`](../../../../scripts/perf-smoke.mjs), [`.github/workflows/perf-smoke.yml`](../../../../.github/workflows/perf-smoke.yml) | Implementado (`5e3d0a0`) |
| **#305** | `TASK-H5-PERF-007` | Mitigación de cold start en Render (`keep-alive.yml` cada 10 min) y mediciones antes/después | [`.github/workflows/keep-alive.yml`](../../../../.github/workflows/keep-alive.yml), [`../keep-alive-cold-start.md`](../keep-alive-cold-start.md) | Fusionado en `develop` (`v1.12.0`) |
| **#307** | `TASK-H5-APIM-001` | Instancia Azure API Management `apim-g1-marketplace-20` en plan `Consumption` + IAM | [`azure-apim/README.md`](../../../../azure-apim/README.md) | Cerrado |
| **#309** | `TASK-H5-APIM-003` | Políticas APIM: `validate-jwt` (OIDC/JWKS G7), `rate-limit` (60/min → 429), CORS, `X-Correlation-Id` | [`azure-apim/policies/api-policy.xml`](../../../../azure-apim/policies/api-policy.xml) | Cerrado (`v1.10.2`) |
| **#311** | `TASK-H5-APIM-006` | Políticas APIM como código + workflow CD con validación `xmllint` | [`.github/workflows/apim-deploy.yml`](../../../../.github/workflows/apim-deploy.yml) | Cerrado (`v1.10.1`) |

---

## 2. Resumen de Resultados Verificados (Sin Secretos ni PII)

- **SCA Producción (`npm audit --omit=dev --audit-level=high`):** `0 vulnerabilities` en Backend y Frontend.
- **Licencias Producción (`scripts/check-licenses.mjs`):** `147/147` paquetes resueltos en Backend y `60/60` en Frontend (`0 UNKNOWN`, `0 prohibidas`).
- **Cobertura Jest Backend:** `66.37%` statements (umbral `66%`), `63.01%` branches (umbral `63%`), `64.14%` functions (umbral `64%`), `69.06%` lines (umbral `69%`).
- **Keep-Alive Render (`/health`):** reducción de cold start de **`32.795 s`** a **`0.262 s` – `0.355 s`** (`-99%`).
- **Smoke de Performance (`scripts/perf-smoke.mjs`):** `21.84 RPS`, `p50 = 182 ms`, **`p95 = 231.57 ms`** (umbral `≤ 1500 ms` → `PASS`), `0.00%` errores; validado bloqueo con umbral `1 ms` → `exit code 1`.
- **Azure APIM (`apim-g1-marketplace-20`, plan `Consumption`):** `401 Unauthorized` ante JWT inválido, `429 Too Many Requests` sobre 60 req/min, CORS y `X-Correlation-Id` verificados en vivo.

---

## 3. Documentos del Paquete
- [`ciclo-hallazgo-correccion-retest.md`](./ciclo-hallazgo-correccion-retest.md): Registro completo de hallazgos reales bloqueados por los gates, sus tickets/PRs, correcciones y retests en verde.
- [`../keep-alive-cold-start.md`](../keep-alive-cold-start.md): Evidencia antes/después de mitigación de arranque en frío en Render.
