# Checklist del congelamiento H5 · 26/11/2026

Jim registra el candidato y Andrés revisa. Estado al 22/11. Las referencias de base ayudan a comparar el candidato y recuperar una versión previa.

| Referencia | Evidencia antes del congelamiento |
|---|---|
| Backend | `develop` `d595caa` (1.9.0). Entraron [BE #253](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/253), [BE #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331), [BE #332](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/332), [BE #333](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/333), [BE #338](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/338) y [BE #339](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/339). En el merge `f11139f` pasaron [validación BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270880) y [CI-CD BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270842) con Render/smoke y GHCR. |
| Frontend | `develop` `e56a13e` (1.4.0). Entraron [FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158), [FE #159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159) y [FE #160](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/160). En `685ccec` pasaron [E2E FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296873) y [CI-CD FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296978) con Vercel/smoke y GHCR. |
| SPECS | `develop` `ccec225`, con [SPECS #18](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/18) y [SPECS #19](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/19). Evidencia Git, sin checks reportados. |
| Seguridad / integración | CI de [auth y Prism](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45077991907) verde. Kit #338, DAST #339 y QA de direcciones aportan evidencia **MOCK**. G-AUTH/G-ADDRESS siguen pendientes de acceso y autorización. H-05 tiene contrato acordado, prueba REAL del 23/11 pendiente. |

## Validaciones del candidato

- [ ] Registrar los tres SHAs efectivos y sus URLs/artefactos. Identificar el último despliegue funcional que se puede restaurar y guardar su referencia. Las versiones automáticas del 22/11 no representan aprobación del freeze.
- [ ] Adjuntar CI del candidato: lint/typecheck/build, pruebas unitarias/E2E, verificaciones de contrato y reportes sanitizados SAST/SCA/secrets. Registrar los hallazgos DAST y el retest o la aceptación de cada riesgo aplicable.
- [ ] Registrar artefacto por digest, migraciones requeridas, comprobación del respaldo y secuencia de rollback por servicio. Andrés valida la secuencia con Fernando. Si falla el smoke o persiste un hallazgo alto/crítico aplicable, conservar la versión anterior y repetir smoke si se restaura.
- [ ] Ejecutar smoke de cuenta, catálogo, carrito y checkout en el candidato. Guardar entorno, hora, SHA y resultado. Declarar qué tramo se ejecutó con fixtures. Alta/listado G7 REAL requiere credenciales y autorización. Cotización sigue MOCK en una variante separada.
- [ ] Adjuntar los reportes autorizados de performance/APIM y trazas H-05 si entran al alcance congelado. Mantener fuera del tramo REAL cada gate abierto con dueño, siguiente paso y fecha. Incluir la evidencia de [#318](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/318) únicamente después de recibir y verificar los eventos.
- [ ] Anexar acta de ensayo [#326](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/326) y paquete [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324). Registrar riesgos aceptados, decisión de liberar o mantener la versión anterior, firmas de Jim y Andrés, fecha efectiva y enlace a etiqueta cuando corresponda.

Estado de [#327](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/327): checklist preparado. El freeze, la firma y la etiqueta del candidato siguen pendientes del 26/11.
