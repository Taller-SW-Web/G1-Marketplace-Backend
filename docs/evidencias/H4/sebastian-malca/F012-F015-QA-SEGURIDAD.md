# Evidencia H4 — QA seguridad / DevSecOps F-012…F-015 (Backend, MOCK)

**Autor:** Sebastian Malca
**Revisor:** Giuliano Macchiavello (`@GiulianoMaPe`)
**Rama:** `feat/h4-f012-f015-detalle-comercial`
**PR:** #232 · **Frontend:** #107
**Fecha:** 2026-10-26
**Entorno:** Windows 11 · Node v24.15.0 · npm 11.12.1 · Gitleaks 8.30.1 (binario verificado por checksum) · Semgrep 1.181.0 con el ruleset local `.security/semgrep.yml` del repo Frontend · base de comparación `9dc5cfd` (`develop`).

> **Etiqueta:** pruebas y scans sobre el corte **MOCK**. No sustituyen DAST ni
> validación en un despliegue autorizado (`TASK-F0xx-INT-001` sigue bloqueada
> por I-01).

## Negativos de seguridad por función

| Funcional | Caso negativo | Resultado esperado | Evidencia | Estado |
|---|---|---|---|---|
| F-012 | SKU de **otro** producto | `409 SKU_NOT_BELONG_TO_PRODUCT`; no se filtra el precio de otro SKU | unit `rechaza un SKU ajeno al producto`, e2e `rechaza un SKU ajeno` | ✅ |
| F-012 | SKU válido sin precio vigente | `422 PRICE_NOT_AVAILABLE`; nunca 0 ni precio heredado | unit + e2e `SKU válido sin precio → 422` | ✅ |
| F-012 | Versión/vigencia inválida | oferta no vigente → precio regular sin descuento; moneda/importe/descuento inválidos → `502` | unit `F-012 - reglas de precio` (5 casos) | ✅ |
| F-012 | Respuesta con datos ajenos al contrato | rechazada; no se exponen `stock`, `coupon` ni totales | unit + e2e `no expone cupón, stock ni total de pedido` | ✅ |
| F-013 | SKU ausente, duplicado o combinación repetida | `502 CATALOG_INVALID_RESPONSE`; no se publica selector parcial | unit `API-CA-F013-02`, e2e `filtra borradores y no expone stock ni precio` | ✅ |
| F-013 | Variante en `DRAFT` | filtrada de la respuesta | unit + fixture `SKU-MOCK-VAR-4` | ✅ |
| F-014 | SKU de otro producto | `409`; no se revela inventario ajeno | unit + e2e `exige SKU de variante y rechaza SKU ajeno` | ✅ |
| F-014 | Respuesta con saldos internos (`quantity`, `onHand`, `reserved`, `locationId`) | rechazada (`502`) | unit `la guardia rechaza estados no homologados y saldos internos` | ✅ |
| F-014 | Fallo de inventario | nunca se degrada a `OUT_OF_STOCK` | unit + e2e `RC-F-014-01` | ✅ |
| F-014 | Caché | máximo 30 s, sólo estado comercial; no incluye costos ni datos de sesión | revisión de código: `checkedAt` + `Cache-Control` del controlador | ✅ |
| F-015 | Producto origen, duplicados, >8 tarjetas o imagen no https | descartados; no se expone `stock`/`availability` | unit `la guardia rechaza duplicados, origen, >8 e imagen inválida` | ✅ |
| F-015 | Fallo del proveedor | degradación a `[]`, sin filtrar el error interno | unit + e2e `CA-F015-03` | ✅ |

## Scans ejecutados

| Check | Herramienta | Alcance | Resultado |
|---|---|---|---|
| `secrets-positive-control` | Gitleaks 8.30.1 | canario sintético en directorio temporal | PASS |
| `secrets-source` | Gitleaks 8.30.1 | snapshot de `git ls-files` (rastreados + nuevos, sin `node_modules`) | PASS — 0 hallazgos |
| `secrets-history` | Gitleaks 8.30.1 | `9dc5cfd..HEAD` | PASS — 0 hallazgos |
| `sast-positive-control` | Semgrep 1.181.0 | canario con `eval(userInput)` | PASS |
| `sast` | Semgrep 1.181.0 | `src`, `scripts`, `test`, `prisma` (138 archivos) | PASS — 0 hallazgos |
| `sca-all` | `npm audit` | todas las dependencias | PASS — 0 vulnerabilidades |
| `sca-runtime` | `npm audit --omit=dev` | dependencias de ejecución | PASS — 0 vulnerabilidades |
| Frontend `sca/sast/secrets` | CI del PR #107 | FE + historial + build | PASS — run [40439451125](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/40439451125) |

Metadatos sanitizados (sin coincidencias, snippets, correos ni secretos):
[`docs/evidencias/H4/sebastian-malca/seguridad/summary-F012-F015.json`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/h4-f012-f015-detalle-comercial/docs/evidencias/H4/sebastian-malca/seguridad/summary-F012-F015.json)

### Hallazgo y retest

| # | Hallazgo | Severidad | Acción | Estado |
|---|---|---|---|---|
| 1 | `happy-dom@21.0.1` (dependencia de desarrollo del Frontend) con CVE-2026-33943, corrección no major disponible; rompía el gate `sca-all` del CI | Alta (dev, no explotable en runtime) | Actualizado a `21.0.4` en el PR #107; `npm audit` → 0; CI del FE en verde | ✅ corregido y reprobado |

No quedan hallazgos críticos ni altos explotables abiertos en el alcance MOCK.

## Límites y pendientes

- **DAST:** no ejecutado; requiere un despliegue autorizado (no disponible en este corte). No se marca como aprobado.
- **SAST:** ruleset local de cuatro reglas (código dinámico, sink HTML, TLS deshabilitado, ejecución de shell). No certifica análisis interprocedural ni taint completo.
- **SCA:** el gate acepta `moderate`/`low` con aceptación humana; hoy no hay ninguno.
- **Backend:** el repo no tiene workflow de seguridad propio; estos scans se ejecutaron localmente con las mismas herramientas/versiones del gate del Frontend. Se recomienda portar el gate al CI del backend (propuesta para Giuliano).
- **Datos:** no se usaron datos personales ni secretos reales; todos los fixtures son ficticios y están etiquetados MOCK.
