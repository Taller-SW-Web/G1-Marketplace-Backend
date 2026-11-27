# BE #392 — Informe go/no-go

**Estado:** en consolidación; el issue sigue abierto. Ya están disponibles la matriz y los reportes de cobertura de Diego, los casos k6 de Fernando y las evidencias REAL de G7/Ventas/Despacho. Este índice integrado está en [PR #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/408); aún no está fusionado en `develop`.

- [Issue BE #392](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/392)
- [Matriz F-001..F-040 BE #291/#299 — PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/aeac35ff99d8bf5a685c6ce43cb5fd2fec8add5e/docs/evidencias/H5/MATRICES-TASK-H5-291-299.md)
- [Evidencia relacionada y clasificación MOCK/REAL](291-292-137-cobertura.md)
- [Tabla consolidada de los 15 casos (5 funcionales, 5 integración, 5 performance)](392-casos-15.md)

## Criterios pendientes de completar

| Requisito | Estado | Evidencia / acción |
|---|---|---|
| 15 casos identificados y trazables | 15 casos compilados abajo: 5 funcionales MOCK/LOCAL, 5 de integración REAL reportados y 5 de performance LAB LOCAL | CP-PERF-01..05 ya existe en [BE #396](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/154ecf03eed9cc0d50c5b81b10294c37dc2c1e02/docs/evidencias/H5/performance/be-391/reporte-final.md#casos-de-performance-para-be-392); los funcionales enlazan a las suites de matriz #354 y las integraciones a reportes fuente |
| Runs y reportes vinculados | Parcial: fuentes ya enlazadas; algunas corridas reales no tienen permalink CI | La matriz, cobertura, k6, compra, BFF, RabbitMQ y webhook están en el [índice H5](README.md); preservar run/registro fuente al congelar |
| Etiquetas de ejecución | Cubierto por matriz | PR #354 distingue `LOCAL`, `PIN`, `BLOCKED`, `NOT-COVERED`; esta tabla agrega `MOCK`, `REAL` o `LAB LOCAL` sin convertir fixtures en REAL |
| SAST y DAST | Parcial: Backend pasó en CI | [SAST/SCA/Secret Scan del PR #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45910280893) y [DAST OWASP ZAP](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45910280872); documentar alcance y SHA en el informe congelado |
| Riesgos, bloqueos y desviaciones | Parcial | Cuenta B 403, CSAT, `DESPACHADO`/`ENTREGADO` de `PED-2026-00092`, `correlation-id`, E2E multi-módulo REAL y consumo automático posterior al fix siguen sin cierre |
| Recomendación go/no-go | Pendiente | Completar tras consolidar los 15 casos y obtener validación del PO |
| Validación del PO | Pendiente | Enlazar la decisión y fecha del PO al informe final |

## Inventario preliminar de evidencia

Las fuentes disponibles ya están asociadas a los 15 casos de la tabla: compra y BFF; publicación G7, webhook y dedupe de correo; cinco casos k6; suites locales/MOCK FE/BE; cobertura BE/FE. La selección no pretende cubrir las 40 F; esas conservan su estado individual en la matriz de Diego.

La selección de 15 casos está compilada en [392-casos-15.md](392-casos-15.md). La decisión del PO y el tratamiento de los riesgos residuales siguen pendientes; el resultado documental es **PENDIENTE**, no `GO` ni `NO-GO`.
