# TASK-H5-HK-001 (`BE #281`): Reconciliación de 41 issues S01–S04 / H4 abiertos de `@DiesmEsp`

- **Issue:** [BE #281](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/281)
- **Responsable:** `@DiesmEsp` (Diego Espinoza)
- **Revisores:** `@saire22` (Fernando Saire — funciones F-036..F-040 y `#214`) · `@JimSegovia` (Jim Segovia — transversales `#208`, `#219`, `FE #97`, `#102`, `#103`)
- **Fecha de corte:** 2026-11-26
- **Regla de flujo aplicada:**
  1. **Sin etiquetas adicionales** (el seguimiento operativo se gestiona mediante los campos `Status` y `Alcance` de los GitHub Projects [Marketplace Backend S02 H4 (#4)](https://github.com/orgs/Taller-SW-Web/projects/4) y [Marketplace Frontend S02 H4 (#3)](https://github.com/orgs/Taller-SW-Web/projects/3)).
  2. **Sin cierres unilaterales:** El desarrollador deja evidencia y solicita revisión; el cierre final de cada issue corresponde exclusivamente al revisor (`@saire22` / `@JimSegovia`).
  3. **Ningún issue queda abierto sin motivo:** Todos los issues que no están listos para cierre conservan justificación explícita de su dependencia (`REAL`, despliegue o alcance posterior a H4).

---

## Resumen de acciones sobre GitHub Projects

| Grupo | Cantidad | Status en Project | Acción realizada en esta reconciliación |
|---|---:|---|---|
| BE F-036..F-040 (`#175–#193`, `#195–#196`, `#198–#199`) | 23 | `En revisión` | Mantiene `En revisión`; comentado enlace actualizado a [BE PR #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239) y [BE PR #382](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/382) para revisión/cierre de `@saire22` (y notas de dependencia REAL en `INT`/`QA`). |
| BE F-039 DOC (`#194`) | 1 | `Bloqueado` → **`En revisión`** | Actualizado `Status` a `En revisión`: `F039-DOCUMENTACION-2026-11-05.md` ya fue mergeada en [BE PR #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). |
| BE F-040 INT (`#197`) | 1 | `Bloqueado` | Mantiene `Bloqueado`: integración REAL de CSAT con Ventas G5 (`I-03`, `I-04`, `G-PROMPT`) pendiente de entorno/sandbox REAL (`BE #298`). |
| BE Transversales (`#214`, `#219`) | 2 | `En progreso` → **`En revisión`** | Actualizado `Status` a `En revisión`: `#214` tiene evidencia `qa-214/` enviada a `@saire22`; `#219` (`Alcance: Posterior a H4`) tiene `REESTIMACION-2026-11-03.md` para `@JimSegovia`. |
| BE Transversal (`#208`) | 1 | `En progreso` | Mantiene `En progreso`: matriz preliminar lista; cierre transversal pendiente de evidencia REAL consolidada de los 40 F (`@JimSegovia`). |
| FE F-036..F-040 (`#87–#96`) | 10 | `En revisión` | Mantiene `En revisión`: implementación FE mergeada en [FE PR #118](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118); `#87, #89, #91, #93, #95` listos para revisión/cierre de `@saire22` (rediseño H5 `V-009` en `FE #151`); `#88, #90, #92, #94, #96` (`QA-001`) con nota de validación E2E en despliegue. |
| FE Transversales (`#97`, `#102`, `#103`) | 3 | `Pendiente` | Mantiene `Pendiente` con motivo explícito: `#97` requiere prueba en nube REAL de F-006/F-007 (G6); `#102` y `#103` tienen `Alcance: Posterior a H4` (S03/S04, `@JimSegovia`). |
| **Total reconciliado** | **41** | — | **41/41 con estado y motivo verificable.** |

---

## Matriz completa — Backend (`Marketplace Backend S02 H4`, 28 issues)

| Issue | Tarea | Alcance | Status Project | Revisor | Evidencia / Motivo explícito |
|---|---|---|---|---|---|
| `BE #175` | `TASK-F036-BE-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Implementado y mergeado en `BE PR #239` + `EVIDENCIA.md`. Listo para revisión/cierre de `@saire22`. |
| `BE #176` | `TASK-F036-DB-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Persistencia `WishlistItem` verificada en PG16 y mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #177` | `TASK-F036-INT-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Adaptador/dobles en `BE PR #239`; pendiente homologación REAL contra G6 (`BE #298`). |
| `BE #178` | `TASK-F036-QA-002` | `H4 cierre objetivo` | `En revisión` | `saire22` | `F036-QA-SEGURIDAD-2026-11-05.md` en `BE PR #239`; pendiente retest en despliegue tras `BE #298`. |
| `BE #179` | `TASK-F036-DOC-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | `F036-DOCUMENTACION-2026-11-05.md` mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #180` | `TASK-F037-BE-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Implementado y mergeado en `BE PR #239` + `BE PR #382`. Listo para revisión/cierre de `@saire22`. |
| `BE #181` | `TASK-F037-DB-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Lectura `WishlistItem` verificada en PG16 y mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #182` | `TASK-F037-INT-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Adaptador G6 en `BE PR #239`; pendiente homologación REAL contra G6 (`BE #298`). |
| `BE #183` | `TASK-F037-QA-002` | `H4 cierre objetivo` | `En revisión` | `saire22` | `F037-QA-SEGURIDAD-2026-11-05.md` en `BE PR #239`; pendiente retest en despliegue tras `BE #298`. |
| `BE #184` | `TASK-F037-DOC-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | `F037-DOCUMENTACION-2026-11-05.md` mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #185` | `TASK-F038-BE-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | DELETE idempotente mergeado en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #186` | `TASK-F038-DB-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Persistencia verificada en PG16 y mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #187` | `TASK-F038-INT-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Adaptador/dobles en `BE PR #239`; pendiente homologación REAL contra G6 (`BE #298`). |
| `BE #188` | `TASK-F038-QA-002` | `H4 cierre objetivo` | `En revisión` | `saire22` | `F038-QA-SEGURIDAD-2026-11-05.md` en `BE PR #239`; pendiente retest en despliegue tras `BE #298`. |
| `BE #189` | `TASK-F038-DOC-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | `F038-DOCUMENTACION-2026-11-05.md` mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #190` | `TASK-F039-BE-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Implementado conservando favorito y mergeado en `BE PR #239` + `BE PR #382`. Listo para revisión/cierre de `@saire22`. |
| `BE #191` | `TASK-F039-DB-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Persistencia transaccional verificada en PG16 y mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #192` | `TASK-F039-INT-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Adaptador G6 en `BE PR #239`; pendiente homologación REAL contra G6 (`BE #298`). |
| `BE #193` | `TASK-F039-QA-002` | `H4 cierre objetivo` | `En revisión` | `saire22` | `F039-QA-SEGURIDAD-2026-11-05.md` en `BE PR #239`; pendiente retest en despliegue tras `BE #298`. |
| `BE #194` | `TASK-F039-DOC-001` | `H4 cierre objetivo` | **`En revisión`** *(actualizado desde `Bloqueado`)* | `saire22` | `F039-DOCUMENTACION-2026-11-05.md` mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #195` | `TASK-F040-BE-001` | `H4 avance y cierre posterior` | `En revisión` | `saire22` | Implementado y mergeado en `BE PR #239` + cobertura unitaria reforzada en `BE PR #382`. Listo para revisión/cierre de `@saire22`. |
| `BE #196` | `TASK-F040-DB-001` | `H4 avance y cierre posterior` | `En revisión` | `saire22` | Persistencia `PostDeliveryPrompt` verificada en PG16 y mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #197` | `TASK-F040-INT-001` | `H4 avance y cierre posterior` | `Bloqueado` | `saire22` | Pendiente integración REAL con Ventas G5 (`I-03`, `I-04`, `G-PROMPT`) en `BE #298`. |
| `BE #198` | `TASK-F040-QA-002` | `H4 avance y cierre posterior` | `En revisión` | `saire22` | `F040-QA-SEGURIDAD-2026-11-05.md` en `BE PR #239`; pendiente retest en despliegue tras `BE #298`. |
| `BE #199` | `TASK-F040-DOC-001` | `H4 avance y cierre posterior` | `En revisión` | `saire22` | `F040-DOCUMENTACION-2026-11-05.md` mergeada en `BE PR #239`. Listo para revisión/cierre de `@saire22`. |
| `BE #208` | `TASK-TRANS-S02-DOC-002` | `H4 transversal` | `En progreso` | `JimSegovia` | Matriz preliminar en `BE PR #239`; cierre transversal requiere evidencia REAL consolidada de 40 F. |
| `BE #214` | `TASK-TRANS-S02-QA-002` | `H4 transversal` | **`En revisión`** *(actualizado desde `En progreso`)* | `saire22` | Evidencia `qa-214/` enviada en `BE PR #239` para revisión de avance por `@saire22`; validación REAL final en `BE #298`. |
| `BE #219` | `TASK-TRANS-S03-DOC-002` | `Posterior a H4` | **`En revisión`** *(actualizado desde `En progreso`)* | `JimSegovia` | `REESTIMACION-2026-11-03.md` mergeada en `BE PR #239`; revisión de `@JimSegovia` y confirmaciones de carga H5/H6 pendientes. |

---

## Matriz completa — Frontend (`Marketplace Frontend S02 H4`, 13 issues)

| Issue | Tarea | Alcance | Status Project | Revisor | Evidencia / Motivo explícito |
|---|---|---|---|---|---|
| `FE #87` | `TASK-F036-FE-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Implementado y mergeado en `FE PR #118`. Listo para revisión/cierre de `@saire22` (rediseño `V-009` en `FE #151`). |
| `FE #88` | `TASK-F036-QA-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Pruebas locales/MOCK en `FE PR #118`; validación E2E en despliegue REAL pendiente. |
| `FE #89` | `TASK-F037-FE-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Implementado y mergeado en `FE PR #118`. Listo para revisión/cierre de `@saire22` (rediseño `V-009` en `FE #151`). |
| `FE #90` | `TASK-F037-QA-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Pruebas locales/MOCK en `FE PR #118`; validación E2E en despliegue REAL pendiente. |
| `FE #91` | `TASK-F038-FE-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Implementado y mergeado en `FE PR #118`. Listo para revisión/cierre de `@saire22` (rediseño `V-009` en `FE #151`). |
| `FE #92` | `TASK-F038-QA-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Pruebas locales/MOCK en `FE PR #118`; validación E2E en despliegue REAL pendiente. |
| `FE #93` | `TASK-F039-FE-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Implementado y mergeado en `FE PR #118`. Listo para revisión/cierre de `@saire22` (rediseño `V-009` en `FE #151`). |
| `FE #94` | `TASK-F039-QA-001` | `H4 cierre objetivo` | `En revisión` | `saire22` | Pruebas locales/MOCK en `FE PR #118`; validación E2E en despliegue REAL pendiente. |
| `FE #95` | `TASK-F040-FE-001` | `H4 avance y cierre posterior` | `En revisión` | `saire22` | Presentación CSAT mergeada en `FE PR #118`. Listo para revisión/cierre de `@saire22`. |
| `FE #96` | `TASK-F040-QA-001` | `H4 avance y cierre posterior` | `En revisión` | `saire22` | Pruebas locales/MOCK en `FE PR #118`; validación E2E en despliegue REAL pendiente. |
| `FE #97` | `TASK-TRANS-S01-QA-001` | `H4 transversal` | `Pendiente` | `JimSegovia` | Prueba en nube con dato REAL de catálogo F-006/F-007 pendiente de ambiente integrado G6 en H5. |
| `FE #102` | `TASK-TRANS-S03-QA-001` | `Posterior a H4` | `Pendiente` | `JimSegovia` | Alcance `Posterior a H4` (E2E checkout S03). |
| `FE #103` | `TASK-TRANS-S04-QA-001` | `Posterior a H4` | `Pendiente` | `JimSegovia` | Alcance `Posterior a H4` (integración F-032/F-035 S04). |
