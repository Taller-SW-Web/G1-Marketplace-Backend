# TASK-H5-HK-002 — resumen F-006–F-010

Fecha de corte: 2026-11-27. Se actualiza el comentario previo [#7210342702](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/328#issuecomment-7210342702) con estados GitHub y evidencia posterior. La issue #328 permanece abierta para revisión de Sebastian.

## Preflight

- Backend #328 está `open`, declara **Sin dependencias externas** y no se encontró un PR abierto para H5-HK-002.
- SPECS [PR #16](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/16) continúa `open` y sin merge; concentra las cinco entregas DOC.
- No se cerró, reabrió ni modificó ninguna subtarea, label o DoD.

## Estado de las tareas por función

Estados consultados en GitHub el 27/11. `En revisión`, `Pendiente` y `Bloqueado` son el estado de origen conservado en cada issue; `open`/`closed` es el estado GitHub.

| Función | Implementación FE / BE | QA funcional FE | Integración BE | QA seguridad BE | DOC BE |
| --- | --- | --- | --- | --- | --- |
| F-006 Inicio | [FE #27](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/27) `open / En revisión`; [BE #44](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/44) `closed` | [#28](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/28) `open / Pendiente` | [#45](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/45) `open / Bloqueado` | [#46](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/46) `open / Pendiente`; evidencia publicada, review pendiente | [#47](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/47) `open / Pendiente`; PR #16 abierta |
| F-007 Búsqueda | [FE #29](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/29) `open / En revisión`; [BE #48](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/48) `closed` | [#30](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/30) `open / Pendiente` | [#49](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/49) `open / Bloqueado` | [#50](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/50) `open / Pendiente`; evidencia publicada, review pendiente | [#51](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/51) `open / Pendiente`; PR #16 abierta |
| F-008 Filtros | [FE #31](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/31) `open / Pendiente de aceptación`; [BE #52](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/52) `closed` | [#32](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/32) `open / Pendiente` | [#53](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/53) `open / Bloqueado` | [#54](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/54) `open / Pendiente`; evidencia publicada, review pendiente | [#55](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/55) `open / Pendiente`; PR #16 abierta |
| F-009 Orden | [FE #33](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/33) `open / Pendiente de aceptación`; [BE #56](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/56) `closed` | [#34](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/34) `open / Pendiente` | [#57](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/57) `open / Bloqueado` | [#58](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/58) `open / Pendiente`; evidencia publicada, review pendiente | [#59](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/59) `open / Pendiente`; PR #16 abierta |
| F-010 Paginación | [FE #35](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/35) `open / Pendiente de aceptación`; [BE #60](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/60) `closed` | [#36](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/36) `open / Pendiente`; sin resultado nuevo | [#61](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/61) `open / Bloqueado`; sin resultado nuevo | [#62](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/62) `open / Pendiente`; evidencia publicada, review pendiente | [#63](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/63) `open / Pendiente`; PR #16 abierta |

Las implementaciones BE #44/#48/#52/#56/#60 están cerradas. El código FE ya está integrado mediante [Frontend #124](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/124), con review de Jim registrado; FE #27/#29 siguen `open / En revisión` y FE #31/#33/#35 siguen `open / Pendiente` de aceptación independiente. Las cinco QA de seguridad conservan evidencia publicada y esperan review. Las cinco DOC continúan abiertas/pendientes con [PR #16](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/16) abierta. El review de código ya registrado para FE no sustituye aceptación de cada tarea. Las implementaciones BE se integraron mediante [Backend #265](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/265).

## Evidencia nueva desde el comentario anterior

| Función / tarea | Evidencia y resultado | Límite conservado |
| --- | --- | --- |
| F-007 / BE #49 | [Commit `bafb418`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/bafb418721c77ae85c77363f9104f3beddf3f433): búsqueda positiva sin filtros devolvió HTTP 200/REAL y los dos homónimos. | Prueba `q` sin filtro de precio; no cierra #49 ni acredita todos sus criterios. |
| F-009 / BE #57 | [Commit `2c5cbf3`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/2c5cbf36b403cd50e7d6a38e23196fd65a5fb164): cuatro GET BFF REAL, `NAME_ASC`/`NAME_DESC`, páginas 0/1 y tamaño 1, dieron 200/REAL y el orden 002 → 001. | Sólo el conjunto de dos homónimos; #57 sigue abierta/bloqueada por dependencias/criterios restantes. |
| F-009 / FE #34 | [Commit `9a8f13a`](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/commit/9a8f13aebf63ab31aa043de32bfb6e3b3b128d19): el intento más reciente de navegador siguió pendiente y se canceló; no devolvió status HTTP, snapshot, error ni URL final. | El comentario anterior describía una muestra distinta con DNS/HTTP 000. Se conserva sólo como histórico: este intento no permite atribuir DNS ni afirmar que el sitio esté caído. Orden/IDs visibles de UI siguen sin observarse. |
| F-008 / FE #32 y BE #53 | [FE commit `eb03839`](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/commit/eb03839fd78e4fb090604e08d1b7445916d8146a): búsqueda con rango 40–50 respondió HTTP 503 `CATALOG_TIMEOUT`, source REAL, BFF request ID `b8591908-de44-4431-8241-08c148ca813f`, sin productos, precio o total. [BE commit `ff24eb4`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/ff24eb40aaf4a0632bfa449aa1b02fe75cb9fe49) registra la misma frontera. Logs Render correlacionan ese request con `PROVIDER_TIMEOUT`, status 503 y duración 15,234 ms. | No se identifica causa aguas arriba ni se verifica el resultado/precio. El ID solicitado es del BFF, no un correlationId de G6. |
| F-010 / FE #36 y BE #61 | Sin resultado nuevo desde el corte anterior. | Ambas siguen abiertas; #61 permanece bloqueada. |

Para F-008, los datos G6 suministrados fueron producto 001 `93f7f500-077d-432e-be98-31cb9ee0d66d` a S/39.90 y producto 002 `8ad24563-c9da-4305-b650-1dd47a14fffb` a S/49.90, ambos activos, categoría Balones y marca Nike. El filtro 40–50 debía devolver sólo 002, pero la respuesta de timeout no valida el resultado.

## Cierre del resumen

#328 sigue `open`, sin dependencias externas y pendiente de revisión de Sebastian. Este resumen actualiza el corte y enlaza la evidencia existente; no modifica subtareas, estados, labels, criterios de aceptación ni dependencias.

No se ejecutaron pruebas ni requests de aplicación para preparar este resumen; sólo se consultaron estados GitHub y evidencia ya publicada.
