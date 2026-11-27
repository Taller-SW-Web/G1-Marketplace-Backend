# Ciclo Hallazgo → Ticket → Corrección → Retest (`TASK-H5-CICD-010` / Issue #290)

Registro trazable de **4 ciclos reales** detectados por los gates automatizados de CI/CD, seguridad y revisión independiente durante el Hito 5, sin secretos ni PII.

---

## Tabla Maestra de Trazabilidad

| # | Gate / Fuente | Hallazgo detectado (evidencia de bloqueo) | Ticket / PR | Corrección aplicada (commit) | Retest y evidencia en verde |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **1** | **SAST (Semgrep)** | Regla `javascript.node-crypto.security.gcm-no-tag-length` en `src/auth/session.store.ts:35`: `createDecipheriv('aes-256-gcm', ...)` sin `authTagLength` explícito. **Rompió el build** ([Run #45311548743](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45311548743), SARIF `backend-semgrep-sarif` archivado). | Issue **#283** / PR **#350** | Commit `2f9fd70` (`fix(security): especificar authTagLength de 16 bytes en AES-256-GCM en SessionStore`): agregado `{ authTagLength: 16 }` en `createCipheriv` y `createDecipheriv`. | Semgrep retesteado en PR **#350** → **0 findings** (`PASS`), fusionado en `develop` (`5032ad3`, `v1.12.0`). |
| **2** | **Secret Scan (Gitleaks historial)** | 2 hallazgos `generic-api-key` en commit histórico `727309be` (`src/checkout/checkout.service.spec.ts:939` y `src/notifications/notification-worker.service.spec.ts:6`). **Rompió el build** ([Run #45311548743](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45311548743), SARIF redactado `backend-gitleaks-sarif` archivado). | Issue **#283** / PR **#350** | Auditoría vía `git show 727309be:...` confirmó clave sintética de test (`0123456789abcdef...`). Commit `78ff7a7`: registrados los 2 fingerprints exactos en `.gitleaksignore` con justificación. | Gitleaks retesteado en PR **#350** → **0 leaks** (`PASS`), fusionado en `develop` (`5032ad3`, `v1.12.0`). |
| **3** | **SCA / OSV + Licencias + Cobertura (Review `@LeonidasGarcia`)** | Revisión `CHANGES_REQUESTED` en PR **#350**: (a) `osv-scanner` usaba `\|\| true` ocultando errores; (b) `busboy@1.6.0` y `streamsearch@1.1.0` reportaban `UNKNOWN` y sin inventario de paquetes; (c) umbrales Jest por debajo de la línea base (`66.37%`/`63.01%`/`64.14%`/`69.06%`). | Issues **#284**, **#287** / PR **#350** | Commit `0b33210` (BE) y `c2a9132` (FE): gate OSV real por `CVSS >= 7.0` sin `\|\| true`; resolución de licencias desde `node_modules/<pkg>/package.json` (`busboy` y `streamsearch` → `MIT`), inventario `packages[]` y bloqueo ante `UNKNOWN`; umbrales Jest elevados a `66/63/64/69`. | `147/147` paquetes BE (`0 UNKNOWN`), `60/60` FE (`0 UNKNOWN`), `0 vulns HIGH/CRITICAL`, cobertura Jest `PASS`, PR **#350** aprobado y fusionado en `develop` (`v1.12.0`). |
| **4** | **APIM Policy XML (`xmllint` gate)** | Error de sintaxis XML en línea 49 de `azure-apim/policies/api-policy.xml` (comillas dobles anidadas dentro de `condition="..."`). **Bloqueó el despliegue APIM** ([Run #45097830086](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45097830086)). | Issues **#309**, **#311** / PR **#341** | Commit `140f678` (`fix(apim): corregir comillas en atributo condition de api-policy.xml`): uso de comillas simples externas `condition='@(...)'`. | [Run #45098592200](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45098592200) → **PASS ✅** en `develop` (`v1.10.1`). |

---

## Limitaciones y Acciones de Gobierno Pendientes
1. **Rama por defecto `main` para `keep-alive.yml` (#305):** GitHub Actions ejecuta eventos `schedule` únicamente desde la rama por defecto (`main`); promover `.github/workflows/keep-alive.yml` a `main` y registrar una corrida `schedule` real.
2. **Entorno protegido `production` (#282 / `TASK-H5-CICD-008`):** configurar *Required reviewers* en **Settings → Environments → `production`** junto con el administrador del repositorio (`@DiesmEsp`).
3. **Contraparte Frontend (#283 / #284):** abrir y fusionar el PR de la rama ya lista `feat/h5-security-gates` (`c2a9132`) hacia `develop` en `G1-Marketplace-Frontend`.
