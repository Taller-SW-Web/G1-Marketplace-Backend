# BE #392 — Informe go/no-go

**Estado:** paquete de evidencia integrado en `develop` por [PR #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/408), merge `7aa625c9ba0cd51d1704a5f0043d16473e790033`; BE #392 sigue abierto. La selección de 15 casos está enlazada abajo; revisión y decisión del PO pendientes.

- [Issue BE #392](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/392)
- [Matriz F-001..F-040 BE #291/#299 — PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/aeac35ff99d8bf5a685c6ce43cb5fd2fec8add5e/docs/evidencias/H5/MATRICES-TASK-H5-291-299.md)
- [Evidencia relacionada y clasificación MOCK/REAL](291-292-137-cobertura.md)
- [Tabla consolidada de los 15 casos (5 funcionales, 5 integración, 5 performance)](392-casos-15.md)

## Criterios pendientes de completar

| Requisito | Estado | Evidencia / acción |
|---|---|---|
| 15 casos identificados y trazables | 15 casos seleccionados: 5 funcionales MOCK/LOCAL, 5 integraciones REAL reportadas y 5 performance LAB LOCAL | [Tabla de casos](392-casos-15.md); la selección no sustituye el mapa completo F-001..F-040 ni declara todas las pruebas ejecutadas en un único run |
| Runs y reportes vinculados | Parcial: se enlazaron permalinks primarios para G7, webhook y correo; aún falta URL canónica del informe lab y artefactos HTML/trace de #138 | La matriz, cobertura, k6, compra, BFF, RabbitMQ y webhook están en el [índice H5](README.md); conservar el alcance y SHA de cada fuente |
| Etiquetas de ejecución | Cubierto por matriz | PR #354 distingue `LOCAL`, `PIN`, `BLOCKED`, `NOT-COVERED`; esta tabla agrega `MOCK`, `REAL` o `LAB LOCAL` sin convertir fixtures en REAL |
| SAST y DAST | Runs/artefactos y SHA documentados; triage DAST pendiente | [SAST #45920685461 / SARIF #15164033447](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45920685461) y [DAST #45920685529 / artefacto #15164403177](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45920685529); alcance/alertas en [informe H5](informe-pruebas-h5.md#5-cobertura-sast-y-dast) |
| Riesgos, bloqueos y desviaciones | Parcial | Cuenta B 403, CSAT, `DESPACHADO`/`ENTREGADO` de `PED-2026-00092`, `correlationId` REAL, E2E multi-módulo REAL, automatic retry post-fix y conflictos de PR #354/#358 siguen sin cierre |
| Recomendación go/no-go | Pendiente | El PO debe revisar los 15 casos, los límites MOCK/LAB LOCAL, alertas DAST y riesgos de salida; luego registrar recomendación y fecha |
| Validación del PO | Pendiente | Enlazar la decisión y fecha del PO al informe final |

## Inventario preliminar de evidencia

Las fuentes disponibles ya están asociadas a los 15 casos de la tabla: compra y BFF; publicación G7, webhook y dedupe de correo; cinco casos k6; suites locales/MOCK FE/BE; cobertura BE/FE. La selección no pretende cubrir las 40 F; esas conservan su estado individual en la matriz de Diego.

La selección de 15 casos está compilada en [392-casos-15.md](392-casos-15.md). La decisión del PO y el tratamiento de los riesgos residuales siguen pendientes; el resultado documental es **PENDIENTE**, no `GO` ni `NO-GO`. El run post-merge #45920685386 tuvo bloqueado el paso SemVer/CHANGELOG por la protección de rama (GH013); los trabajos de build/test/seguridad pasaron.
