# BE #392 — Informe go/no-go

**Estado:** parcial; el issue sigue abierto. No se encontró un informe consolidado en `develop`; este borrador está en [PR #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/408).

- [Issue BE #392](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/392)
- [Matriz base BE #291](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/eb39191e0aef7485fdad4a21b09a8f32b93f3cb0/docs/evidencias/H5/MATRICES-TASK-H5-291-299.md)
- [Evidencia relacionada y clasificación MOCK/REAL](291-292-137-cobertura.md)

## Criterios pendientes de completar

| Requisito | Estado | Evidencia / acción |
|---|---|---|
| 15 casos identificados y trazables | Parcial: 5/15 de performance están documentados | [CP-PERF-01..05 en BE #396](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/154ecf03eed9cc0d50c5b81b10294c37dc2c1e02/docs/evidencias/H5/performance/be-391/reporte-final.md#casos-de-performance-para-be-392); integrarlos a la tabla consolidada y completar 5 funcionales + 5 de integración con todos los campos exigidos |
| Runs y reportes vinculados | Parcial | La matriz, cobertura BE/FE, k6, compra real, BFF, RabbitMQ y webhook están enlazados desde el [índice H5](README.md); faltan varios permalinks primarios y cualquier caso sin fuente no debe contarse como cerrado |
| Clasificación `MOCK` / `REAL` | Parcial | Propuesta documentada en [BE #291 y cobertura](291-292-137-cobertura.md); falta confirmar en la matriz fuente |
| SAST y DAST | Parcial: Backend pasó en CI | [SAST/SCA/Secret Scan del PR #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45910280893) y [DAST OWASP ZAP](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45910280872); documentar alcance y SHA en el informe congelado |
| Riesgos, bloqueos y desviaciones | Parcial | Cuenta B 403, CSAT, `DESPACHADO`/`ENTREGADO` de `PED-2026-00092`, `correlation-id`, E2E multi-módulo REAL y consumo automático posterior al fix siguen sin cierre |
| Recomendación go/no-go | Pendiente | Completar tras consolidar los 15 casos y obtener validación del PO |
| Validación del PO | Pendiente | Enlazar la decisión y fecha del PO al informe final |

## Inventario preliminar de evidencia

Hay corridas y reportes parciales disponibles: compra real y ronda BFF; evento G7 publicado y recuperación manual REAL desde DLQ; webhook; cinco casos k6 `CP-PERF-01..05` en Docker con terceros simulados; FE #138 (dos casos Playwright MOCK y recorrido REAL parcial detenido en login); cobertura BE/FE. **No asumir que estos artefactos completan los 15 casos**: mapearlos explícitamente a la matriz y conservar su etiqueta `MOCK` o `REAL`.

Hasta completar el inventario y la revisión del PO, el resultado documental es **PENDIENTE**, no `GO` ni `NO-GO`.
