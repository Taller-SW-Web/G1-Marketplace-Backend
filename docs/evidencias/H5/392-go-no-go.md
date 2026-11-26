# BE #392 — Informe go/no-go

**Estado:** pendiente; el issue sigue abierto y no se identificó un informe consolidado en `develop`.

- [Issue BE #392](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/392)
- [Matriz base BE #291](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/eb39191e0aef7485fdad4a21b09a8f32b93f3cb0/docs/evidencias/H5/MATRICES-TASK-H5-291-299.md)
- [Evidencia relacionada y clasificación MOCK/REAL](291-292-137-cobertura.md)

## Criterios pendientes de completar

| Requisito | Estado | Evidencia / acción |
|---|---|---|
| 15 casos identificados y trazables | Pendiente | Adjuntar la lista aprobada y enlazar requisito, prueba, run, resultado y commit/versión por caso |
| Runs y reportes vinculados | Parcial | La matriz, cobertura BE/FE, k6, compra real, BFF, RabbitMQ y webhook están enlazados desde el [índice H5](README.md); faltan varios permalinks primarios y cualquier caso sin fuente no debe contarse como cerrado |
| Clasificación `MOCK` / `REAL` | Parcial | Propuesta documentada en [BE #291 y cobertura](291-292-137-cobertura.md); falta confirmar en la matriz fuente |
| SAST y DAST | Pendiente | Incorporar runs y resultados antes de recomendar go |
| Riesgos, bloqueos y desviaciones | Pendiente | Registrar cuenta B 403, CSAT, `ENTREGADO` REAL para `PED-2026-00092`, correlation-id y reportes faltantes, según cierre efectivo |
| Recomendación go/no-go | Pendiente | Completar tras consolidar los 15 casos y obtener validación del PO |
| Validación del PO | Pendiente | Enlazar la decisión y fecha del PO al informe final |

## Inventario preliminar de evidencia

Hay corridas y reportes parciales disponibles, entre ellos la compra real, la ronda BFF con cuenta A, un evento G7 cotejado con outbox, el webhook de despacho, cinco casos k6 en Docker con terceros simulados, un E2E FE con datos simulados y runs de cobertura BE/FE. **No asumir que esos artefactos cubren los 15 casos**: cada uno debe asociarse explícitamente a un caso de la matriz y conservar su etiqueta `MOCK` o `REAL`.

Hasta completar el inventario y la revisión del PO, el resultado documental es **PENDIENTE**, no `GO` ni `NO-GO`.
