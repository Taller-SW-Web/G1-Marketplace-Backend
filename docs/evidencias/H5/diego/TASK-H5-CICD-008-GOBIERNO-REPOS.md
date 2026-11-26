# TASK-H5-CICD-008 (`BE #288`): Gobierno de repositorios BE y FE

- **Issue:** [BE #288](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/288)
- **Responsable:** `@DiesmEsp` (admin de ambos repositorios) · **Revisor:** `@saire22`
- **Repositorios cubiertos:**
  - `Taller-SW-Web/G1-Marketplace-Backend`
  - `Taller-SW-Web/G1-Marketplace-Frontend`
- **Fecha de aplicación:** 2026-11-26

---

## 1. Protección de rama `main` (`branches/main/protection`)

En Backend y Frontend se aplicó la protección clásica de `main` mediante la API de GitHub. Exige los checks de GitHub Actions de la tabla, una aprobación y revisión de CODEOWNERS, invalida aprobaciones obsoletas y bloquea force-push y borrado. También se aplica a administradores.

| Repositorio | Checks de `main` |
|---|---|
| `G1-Marketplace-Backend` | `Build, Compile y Test`, `SAST (Semgrep + SARIF)`, `Secret Scan (Gitleaks código + historial)`, `SCA (npm audit + OSV) y Licencias`, `Quality Gate (Cobertura Jest)`, `backend (22)`, `backend (24)` |
| `G1-Marketplace-Frontend` | `Build, Compile y Test`, `e2e-cart-checkout`, `web` |

---

## 2. Gobierno de rama `develop` (Repository Ruleset `develop-governance-h5`)

Aplicado mediante GitHub Repository Rulesets (`target: branch`, `enforcement: active`, `include: ["refs/heads/develop"]`):
- Reglas activas:
  - `deletion` (impide borrar `develop`)
  - `non_fast_forward` (impide force-push)
  - `pull_request` (`required_approving_review_count: 1`, `require_code_owner_review: true`, `dismiss_stale_reviews_on_push: true`)
  - `required_status_checks` (los checks listados en la tabla para cada repositorio)
- `bypass_actors`: rol `RepositoryRole` Admin (`actor_id: 5`, `bypass_mode: always`).
- **Nota operativa sobre `semantic-release`:** `.releaserc.json` en ambos repos apunta a `develop` usando `GITHUB_TOKEN`. Si en el siguiente push a `develop` `@semantic-release/git` requiere permisos adicionales bajo el ruleset, se recomienda agregar el actor `GitHub Actions` / `Deploy key` en Settings → Rulesets o usar un token con bypass en `RELEASE_TOKEN`.

---

## 3. `CODEOWNERS` en BE y FE

- **Backend:** [.github/CODEOWNERS](../../../.github/CODEOWNERS)
  - Propietarios por defecto: `@saire22 @andreus710 @JimSegovia @DiesmEsp`
  - Rutas específicas: `.github/` (`@andreus710 @DiesmEsp`), `prisma/` (`@LeonidasGarcia @saire22`), `src/security/` (`@andreus710 @JimSegovia`), `src/wishlist/` y `src/csat/` (`@DiesmEsp @saire22`), `src/checkout/` (`@LeonidasGarcia @saire22`), `src/orders/` (`@saire22 @LeonidasGarcia`), `src/webhooks/` (`@LeonidasGarcia @DiesmEsp`).
- **Frontend:** [.github/CODEOWNERS](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/ci/h5-288-repo-governance/.github/CODEOWNERS)
  - Propietarios por defecto: `@saire22 @andreus710 @JimSegovia @DiesmEsp`
  - Rutas específicas: `.github/`, `src/features/wishlist/`, `src/features/checkout/`, `src/features/orders/`, `src/features/auth/`, `src/features/catalog/`.

---

## 4. Entorno `production` con aprobación manual

Configurado en ambos repositorios (`PUT /environments/production`):
- **Aprobadores requeridos (`required_reviewers`):** `@saire22` (`id: 168320005`), `@andreus710` (`id: 170478184`), `@DiesmEsp` (`id: 143339144`).
- **Política de ramas (`deployment_branch_policy`):** `protected_branches: true`.

**Pendiente en Frontend.** El [workflow CI-CD vigente en `main`](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/main/.github/workflows/cicd.yml) invoca Vercel en el job `Deploy a Vercel + Smoke test`, con `environment: pruebas` y un disparador de despliegue limitado a pushes a `develop`. GitHub registra cero despliegues en el entorno `production` de Frontend. Falta conectar el flujo de Vercel a `environment: production` y verificar en una ejecución que GitHub espere la aprobación manual antes de llamar al hook de producción. [Entorno `production` de Frontend](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/settings/environments)

**Pendiente en Backend.** Render reporta que `g1-marketplace-backend` sigue la rama `main` con `autoDeploy: yes` y `autoDeployTrigger: commit`. La revisión exigida por la protección de `main` ocurre antes del merge. Una vez que cambia `main`, Render inicia su autodespliegue sin pasar por el entorno `production` de GitHub. El workflow CI-CD vigente en `main` referencia `pruebas` y GitHub registra cero despliegues de Backend en `production`. Para verificar una aprobación manual de despliegue, falta conectar un job a `environment: production`, desactivar el autodespliegue directo de Render en el corte coordinado y comprobar que el job espere la aprobación antes de invocar el hook de producción. [Servicio en Render](https://dashboard.render.com/web/srv-db05v0navr4c73e9mnug) · [Workflow Backend vigente en `main`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/main/.github/workflows/cicd.yml) · [Entorno `production` de Backend](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/settings/environments)

---

## 5. Verificación

- `GET /repos/Taller-SW-Web/G1-Marketplace-Backend/branches/main` → `protected: true`. La API de protección devolvió los siete checks exigidos, con revisión de CODEOWNERS y aplicación a administradores.
- `GET /repos/Taller-SW-Web/G1-Marketplace-Frontend/branches/main` → `protected: true`. La API de protección devolvió los tres checks exigidos, revisión de CODEOWNERS y aplicación a administradores.
- `GET /repos/Taller-SW-Web/G1-Marketplace-Backend/rulesets` → `develop-governance-h5` (`active`)
- `GET /repos/Taller-SW-Web/G1-Marketplace-Frontend/rulesets` → `develop-governance-h5` (`active`)
- `GET /repos/Taller-SW-Web/G1-Marketplace-Backend/environments/production` → `required_reviewers` configurado
- `GET /repos/Taller-SW-Web/G1-Marketplace-Frontend/environments/production` → `required_reviewers` configurado
- [FE #175](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/175) incorpora el disparador `pull_request` hacia `main` para `Build, Compile y Test`. Los workflows de `e2e-cart-checkout` y `web` ya incluyen `main`.
- En el [PR borrador de verificación hacia `main`](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/179/checks), GitHub marcó los tres checks como obligatorios (`isRequired: true`) y confirmó `SUCCESS` para los tres en el SHA `38c3d57`. Durante la ejecución, GitHub informó `mergeStateStatus: BLOCKED` con checks en curso. El PR también está en borrador. Queda pendiente la captura de la interfaz que muestre el motivo del bloqueo.
- En el [PR borrador de Backend hacia `main`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/404/checks), GitHub marcó los siete checks como obligatorios (`isRequired: true`) y registró `SUCCESS` para los siete en el SHA `081c1a8`. La API devolvió `mergeStateStatus: BLOCKED` mientras `Build, Compile y Test` seguía en curso y los otros seis contextos requeridos ya habían pasado. El PR también estaba en borrador. Queda pendiente la captura del motivo de bloqueo en la interfaz.
