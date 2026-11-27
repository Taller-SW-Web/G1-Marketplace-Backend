# Evidencia `BE #292` (`TASK-H5-TEST-002`) — Cobertura de pruebas unitarias Backend y cierre de huecos por F

- **Issue:** `Taller-SW-Web/G1-Marketplace-Backend#292`
- **Responsable:** Diego Espinoza (`@DiesmEsp`)
- **Revisor:** Fernando Saire (`@saire22`)
- **Fecha:** 2026-11-26
- **Base de auditoría:** `develop` (`2c359be`)

## 1. Reporte de cobertura publicado en CI

El workflow `.github/workflows/security-gates.yml` ejecuta el job `quality-gate-coverage` (`npm run test:cov`) en cada `push` y `pull_request` hacia `develop` y `main`, aplicando los umbrales de `jest.config.js` (`statements: 66`, `branches: 63`, `functions: 64`, `lines: 69`) y publicando el artefacto `backend-coverage-report`.

- Run previo verificado en `develop`: `https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45772947134` (`backend-coverage-report`).
- Mejora aplicada en esta rama: se añadió `coverage/lcov.info` junto a `coverage/coverage-summary.json` en el artefacto `backend-coverage-report`.

## 2. Auditoría y cierre de huecos unitarios (F-036 a F-040)

Al auditar `npm run test:cov` sobre `2c359be`, los módulos de **F-040 (`src/csat/*`)** y los controladores/validadores de **F-036..F-039 (`src/wishlist/*`)** presentaban `0%` de cobertura unitaria o ramas pendientes. Se cerraron con los siguientes tests unitarios:

| Archivo | Antes (Lines / Stmts / Branches) | Después (Lines / Stmts / Branches) | Spec agregado / ampliado |
|---|---|---|---|
| `src/csat/csat.dto.ts` | `0% / 0% / 100%` | `100% / 100% / 100%` | `src/csat/csat.service.spec.ts` |
| `src/csat/csat.service.ts` | `0% / 0% / 0%` | `100% / 100% / 100%` | `src/csat/csat.service.spec.ts` |
| `src/csat/csat.gateway.ts` | `0% / 0% / 0%` | `97.22% / 97.87% / 98.18%` | `src/csat/csat.gateway.spec.ts` |
| `src/wishlist/wishlist.controller.ts` | `0% / 0% / 0%` | `100% / 100% / 100%` | `src/wishlist/wishlist.controller.spec.ts` |
| `src/wishlist/product-id.ts` | `0% / 0% / 0%` | `86.66% / 88.23% / 100%` | `src/wishlist/product-id.spec.ts` |
| `src/wishlist/wishlist-cart.service.ts` | `71.79% / 63.26% / 25%` | `94.87% / 93.87% / 82.14%` | `src/wishlist/wishlist-cart.service.spec.ts` |

## 3. Totales globales antes vs después (`npm run test:cov`)

| Métrica | Antes (`2c359be`) | Después |
|---|---|---|
| Suites / Tests | `58 suites / 686 tests` | `62 suites / 705 tests` |
| Lines | `72.68%` (`2549/3507`) | `75.04%` (`2659/3543`) |
| Statements | `69.33%` (`2885/4161`) | `72.00%` (`3022/4197`) |
| Functions | `70.77%` (`477/674`) | `73.44%` (`495/674`) |
| Branches | `65.36%` (`2763/4227`) | `68.51%` (`2896/4227`) |

## 4. Comandos ejecutados (en entorno `NODE_ENV=test`, `USE_MOCKS=true`)

- `npm run lint` (`tsc --noEmit -p tsconfig.json`): **PASS** (`0` errores)
- `npm run test:cov` (`jest --coverage --runInBand`): **PASS** (`62/62` suites, `705/705` tests)
