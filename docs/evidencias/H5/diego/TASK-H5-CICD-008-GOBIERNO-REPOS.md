# TASK-H5-CICD-008 (`BE #288`): Gobierno de repositorios BE y FE

- **Issue:** [BE #288](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/288)
- **Responsable:** `@DiesmEsp` (admin de ambos repositorios) · **Revisor:** `@saire22`
- **Repositorios cubiertos:**
  - `Taller-SW-Web/G1-Marketplace-Backend`
  - `Taller-SW-Web/G1-Marketplace-Frontend`
- **Fecha de aplicación:** 2026-11-26

---

## 1. Protección de rama `main` (`branches/main/protection`)

Aplicada mediante GitHub Branch Protection API (`enforce_admins: true`, `allow_force_pushes: false`, `allow_deletions: false`, `required_approving_review_count: 1`, `require_code_owner_reviews: true`, `dismiss_stale_reviews: true`).

| Repositorio | Checks obligatorios exigidos antes de fusionar |
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
  - `required_status_checks` (los mismos checks obligatorios por repo que en `main`)
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

---

## 5. Verificación

- `GET /repos/Taller-SW-Web/G1-Marketplace-Backend/branches/main/protection` → `200 OK`
- `GET /repos/Taller-SW-Web/G1-Marketplace-Frontend/branches/main/protection` → `200 OK`
- `GET /repos/Taller-SW-Web/G1-Marketplace-Backend/rulesets` → `develop-governance-h5` (`active`)
- `GET /repos/Taller-SW-Web/G1-Marketplace-Frontend/rulesets` → `develop-governance-h5` (`active`)
- `GET /repos/Taller-SW-Web/G1-Marketplace-Backend/environments/production` → `required_reviewers` configurado
- `GET /repos/Taller-SW-Web/G1-Marketplace-Frontend/environments/production` → `required_reviewers` configurado
- Un PR sin checks obligatorios o sin aprobación de `CODEOWNERS` queda bloqueado para merge en `main` y `develop`.
