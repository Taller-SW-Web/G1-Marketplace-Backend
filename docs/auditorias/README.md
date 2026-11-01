# 🔍 Auditoría H3 — Giuliano Macchiavello (F-006 / F-007) vs. su paquete de responsabilidades

> **Fecha:** 2026-10-16 · **Auditor:** Sebastian Malca (revisor designado en la matriz de responsabilidades)
> **Alcance:** ramas `feat/s1-f006-f007-catalogo` de Backend y Frontend, contrastadas contra el paquete del integrante y la coherencia con el avance F-011 del bloque de Sebastian.

---

## Fuentes de verdad consultadas

| Fuente | Ubicación |
|---|---|
| Paquete de Giuliano | `G1-Marketplace-SPECS · plan/repartición por integrantes/GIULIANO-MACCHIAVELLO-PEREZ.md` |
| Matriz punta a punta | `G1-Marketplace-SPECS · SPECS/RESPONSABILIDADES-PUNTA-A-PUNTA.md` (bloque 2: F-006–F-010) |
| Seguimiento | `plan/seguimiento/F-006-*.md` y `F-007-*.md` |
| Specs del bloque | `SPECS/{funcional,ui,contrato-api,componentes-react}/F-00[67]-*.md` |

## Elementos auditados

| Repo | Rama | Commit |
|---|---|---|
| G1-Marketplace-Backend | `origin/feat/s1-f006-f007-catalogo` | `63071c8` |
| G1-Marketplace-Frontend | `origin/feat/s1-f006-f007-catalogo` | `ad7206c` |
| Nuestro avance (BE) | `origin/feat/h3-f011-f015-detalle-de-producto` | `50f49a1` |
| Nuestro avance (FE) | `origin/feat/h3-f011-f015-detalle-de-producto` | `3e6ea7c` |
| Develop Backend (baseline) | `origin/develop` | `ed9582e` (NestJS) |

**Metodología:** solo lectura (`git show`, `git diff --stat`, `git merge-tree --write-tree`), contraste de archivos contra SPECS y revisión de PRs/CI en GitHub.

---

## 1. Backend de Giuliano — TASK-F006-BE-001 / TASK-F007-BE-001

Arquitectura: **NestJS 11 + TypeScript** (`src/catalog/` module, controller, service, provider, interceptor, filter), adaptado al baseline `ed9582e`.

| Criterio de su paquete | Veredicto | Evidencia |
|---|---|---|
| Ruta BFF propia bajo `/api/v1` | ✅ CUMPLE | `@Controller('api/v1/catalog')` → `GET /home` y `GET /products?q=…`, puerto default 10000 |
| **Validación de `q`** (punto del checklist de revisor) | ✅ CUMPLE | `query.ts` l.18–20: trim + colapso de espacios, longitud 2–120 por codepoints; `1/121 chars` → `400 INVALID_SEARCH_QUERY`; `q` vacía = catálogo completo (según spec) |
| **Mapeo de errores** (punto del checklist) | ✅ CUMPLE* | `application/problem+json` `{type,title,status,code,requestId}`; 400×5 códigos, 405, 503 `CATALOG_UNAVAILABLE` seguro; upstream 401/403/429/5xx → 503 sin exponer detalles. *Salvedades: `requestId` en vez de `instance` (contrato F-011 usa `instance`); el 404 global del baseline responde `{error}` distinto; `ORIGIN_NOT_ALLOWED` quedó huérfano |
| **Sin logs con PII** (punto del checklist) | ✅ CUMPLE | `catalog-request.interceptor.ts` l.28–38: sólo `queryHash = sha256(q)`, `requestId`, status y duración — nunca `q` cruda, IPs, headers ni cuerpos; E2E afirma `expect(logs).not.toContain('private-search-term')`; smoke de CI verifica no-leak |
| Header `X-Catalog-Source` | ✅ CUMPLE | `MOCK｜REAL｜UNCONFIGURED` en ambos endpoints; MOCK prohibido con `NODE_ENV=production` |
| Pruebas positivas/negativas | ✅ CUMPLE | 34 unit + 19 E2E + 6 smoke; CI (`.github/workflows/h3.yml`): Semgrep 0 hallazgos, Gitleaks 0, gate high/critical, inventario de licencias |
| Evidencia MOCK con comandos y resultados | ⚠️ Existe, sin merge | `plan/evidencias/H3-AUTONOMIA-2026-10-16.md` (+ JSONs de CI) y `H3-GIULIANO-CATALOGO-2026-10-14.md` están en la rama SPECS `docs/giuliano-elementos-compartidos`, **no en `main`** (PR-SPECS aún borrador) |
| No adelantar estados | ✅ CUMPLE | Las 6 tareas F-006/F-007 (FE/BE/QA) siguen `Pendiente` — correcto: requieren revisión formal previa |
| ¿Duplica F-011? | ✅ NO | Sólo home + listado; doc declara *"Ficha y retorno siguen en el bloque de Sebastian"* |

> **Pendiente de él:** 19 vulnerabilidades moderadas (dev) en `npm audit` propuestas para evaluación de Leonidas/seguridad **antes de aceptar el PR Backend**; DAST de staging pendiente de destino.

## 2. Frontend de Giuliano — TASK-F006-FE-001 / TASK-F007-FE-001

| Criterio | Veredicto | Evidencia |
|---|---|---|
| V-005 home (carga/error/vacío/categorías) | ✅ CUMPLE | `Home.tsx`; destacados ocultos porque el BFF los devuelve vacíos (gate `G-FEATURED`) — documentado |
| V-006 búsqueda con estados | ✅ CUMPLE | `Catalog.tsx`: loading, error+`Reintentar`, vacío, resultados; query inválida (2–120) sin disparar request |
| Códigos de error esperados del BFF | ✅ CUMPLE | `api.ts`: `INVALID_SEARCH_QUERY/INVALID_PAGE/INVALID_PARAMETERS/INVALID_FILTER/INVALID_SORT/CATALOG_UNAVAILABLE/INVALID_RESPONSE` |
| Header de origen | ✅ CUMPLE | Lee `x-catalog-source`; `MockNotice` visible sólo en `MOCK` |
| Pruebas | ✅ CUMPLE | 16 E2E Playwright (carrera de respuestas, XSS como texto, móvil) + 10 unit de primitivos. *Sin unitarios de SearchBox/Catalog/Home — hallazgo H2 registrado en `docs/REVISION-TASK-F007-FE-001.md`* |
| Estado de integración | ✅ | Feature **mergeada en `main`** (PR #1, merge `0f47537`); PR #3 abierto → `develop` con 2 commits de CI (CI verde) |

## 3. Coherencia con nuestro avance (F-011)

### ✅ Frontend — concuerda

| Verificación | Resultado |
|---|---|
| `merge-tree` rama Giuliano ↔ nuestra rama F-011 | **LIMPIO** (0 conflictos — 42 rutas disjuntas) |
| `merge-tree` nuestra rama FE ↔ `origin/develop` | **LIMPIO** |
| Handoff de spec *"Sebastian recibe DTO y tarjeta compartida"* | ✅ `ProductCard.tsx:13` → `/productos/{slug}?returnTo=…` entra a nuestra ficha; su E2E asserta el href |
| E2E de Giuliano | Requiere **su backend** (ref fijado `63071c8`) — la demo integrada necesita ambas ramas |

> ⚠️ Menor en nuestro lado: **`returnTo` no se consume** en `ProductDetailContainer` (siempre "Volver al catálogo" → `/catalogo`).

### ⚠️ Backend — NO concuerda (bloqueante para nuestro PR)

`develop` migró a **baseline NestJS** (`ed9582e`): `src/server.js` **eliminado** (ahora `src/main.ts` + `app.module.ts`).

Resultado de `git merge-tree --write-tree origin/feat/h3-f011-f015-detalle-de-producto origin/develop` → **exit 1**:

| Archivo | Conflicto |
|---|---|
| `src/server.js` | **modify/delete** — develop lo borró; nosotros lo modificamos (handler F-011) |
| `package.json` | contenido (scripts + devDeps) |
| `package-lock.json` | contenido |
| `.env.example` | contenido (bloque `BFF_MODE` vs. `CORS_ORIGINS`/`CATALOG_SOURCE`) |

**Y más allá del texto:** nuestro controlador es `node:http` puro — **no ejecuta bajo NestJS**. Incluso resolviendo el merge, `GET /api/v1/catalog/products/:slug` no existiría en el baseline nuevo.

| Verificación | Resultado |
|---|---|
| `merge-tree` rama de Giuliano ↔ `origin/develop` (su PR #11) | **LIMPIO** (exit 0) — listo para revisión |
| Duplicación de F-011 en su rama | NO — sólo `@Get('products')` de lista; convive con un futuro `@Get('products/:slug')` |

## 4. Hallazgos y acciones

| # | Acción | Responsable | Prioridad |
|---|---|---|---|
| 1 | ~~**Portar F-011 a NestJS** y rebasear sobre `develop`~~ → **✅ RESUELTO 2026-10-16:** merge de `develop` en la rama (conflictos resueltos: `src/server.js` eliminado según baseline, `package.json`/`package-lock.json` adoptados, `.env.example` con `BFF_MODE` conservado) y port a `ProductDetailModule` (`src/catalog/product-detail.*.ts`) registrado en `src/app.module.ts`. Verificado: `lint` 0 errores, `build` OK, unit 15/15, e2e 21/21, smoke de `dist/main.js` con 200/400/404/504 + `X-Catalog-Source: MOCK` | **Sebastian (nosotros)** | ✅ Resuelto |
| 2 | Revisar **PR #11** (BE → develop) y **PR #3** (FE → develop) de Giuliano — los 3 puntos del checklist de revisor ya auditados: `q` ✅, errores ✅, sin PII ✅ | Sebastian (revisor designado) | 🟠 Alta |
| 3 | Abrir **PR-SPECS** — su evidencia vive en rama sin merge a `main` | Giuliano | 🟡 Media |
| 4 | ~~Consumir `returnTo` en la ficha~~ → **✅ RESUELTO 2026-10-16:** `page.tsx` pasa `searchParams.returnTo` a `ProductDetailContainer`, que lo sanea (ruta interna, sin `//` ni `\`) y lo usa como destino de "Volver al catálogo"; por defecto `/catalogo`. Incluye prueba unitaria | Sebastian (nosotros) | ✅ Resuelto |
| 5 | Actualizar estados en seguimiento **tras** aprobar sus PRs (hoy `Pendiente` es correcto) | Sebastian | 🟡 Tras aprobación |

## 5. Veredicto

El trabajo de Giuliano **concuerda con su paquete de responsabilidades y con nuestro avance en frontend** (merge limpio, handoff de tarjetas correcto, evidencia y CI completos). La **única desconexión real** es la nuestra: la rama F-011 de backend parte de la base **pre-NestJS** y ya no mergea ni corre sobre `develop`. Acción inmediata: portar F-011 al baseline NestJS.

---

### Anexo — comandos de verificación

```bash
# Conflictos de merge (0 = limpio, 1 = conflicto)
git merge-tree --write-tree --name-only origin/feat/h3-f011-f015-detalle-de-producto origin/develop   # → exit 1
git merge-tree --write-tree --name-only origin/develop origin/feat/s1-f006-f007-catalogo              # → exit 0
git merge-tree --write-tree --name-only origin/feat/s1-f006-f007-catalogo origin/feat/h3-f011-f015-detalle-de-producto  # → exit 0 (FE)

# Estado de develop (baseline NestJS)
git ls-tree --name-only origin/develop -- src/
git log --oneline -3 origin/develop
```
