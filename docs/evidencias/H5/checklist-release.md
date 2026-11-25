# Checklist del congelamiento H5 · Viernes 27/11/2026

Jim registra el candidato y Andrés revisa. Estado al 24/11. Las referencias de base del 22/11 sirven para comparar el candidato y recuperar una versión previa.

**Calendario (Lima).** Miércoles 25/11: levantar el broker RabbitMQ de G1 y el receptor del webhook. Jueves 26/11: tener todos los componentes desplegados y probados. Viernes 27/11: corregir, ensayar, firmar y congelar el código. Sábado 28/11: presentar, con RabbitMQ de Seguridad y webhook de Ventas como parte del punto 4.

| Referencia | Evidencia antes del congelamiento |
|---|---|
| Backend | `develop` `d595caa` (1.9.0). Entraron [BE #253](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/253), [BE #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331), [BE #332](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/332), [BE #333](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/333), [BE #338](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/338) y [BE #339](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/339). En el merge `f11139f` pasaron [validación BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270880) y [CI-CD BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270842) con Render/smoke y GHCR. |
| Frontend | `develop` `e56a13e` (1.4.0). Entraron [FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158), [FE #159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159) y [FE #160](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/160). En `685ccec` pasaron [E2E FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296873) y [CI-CD FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296978) con Vercel/smoke y GHCR. |
| SPECS | `develop` `ccec225`, con [SPECS #18](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/18) y [SPECS #19](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/19). Evidencia Git, sin checks reportados. |
| Seguridad / integración | CI de [auth y Prism](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45077991907) verde. Kit #338 en modo Prism, DAST #339 y QA de direcciones aportan evidencia **MOCK**. La [ronda del 23/11 y mini-ronda](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/351) aportan evidencia **REAL directa de G7**. G-AUTH y G-ADDRESS siguen pendientes de homologación vía BFF desplegado y timeout autorizado. RabbitMQ y H-05 tienen prueba **REAL pendiente**. |

## Validaciones del candidato

- [ ] Registrar los tres SHAs efectivos y sus URLs/artefactos. Identificar el último despliegue funcional que se puede restaurar y guardar su referencia. Las versiones automáticas del 22/11 no representan aprobación del freeze.
- [ ] Adjuntar CI del candidato: lint/typecheck/build, pruebas unitarias/E2E, verificaciones de contrato y reportes sanitizados SAST/SCA/secrets. Registrar los hallazgos DAST y el retest o la aceptación de cada riesgo aplicable.
- [ ] Registrar artefacto por digest, migraciones requeridas, comprobación del respaldo y secuencia de rollback por servicio. Andrés valida la secuencia con Fernando. Si falla el smoke o persiste un hallazgo alto/crítico aplicable, conservar la versión anterior y repetir smoke si se restaura.
- [ ] Configurar y comprobar las variables de G7 en Render para el candidato: `G7_API_URL`, `G7_SERVICE_CLIENT_ID`, `G7_SERVICE_CLIENT_SECRET`, configuración de sesión y flags de autenticación/registro/recuperación requeridos. Habilitar alta/listado vía G7 según G-ADDRESS. Registrar nombres y estado de configuración con los valores sensibles reservados al entorno.
- [ ] Ejecutar smoke de cuenta, catálogo, carrito y checkout en el candidato. Guardar entorno, hora, SHA y resultado por tramo **MOCK** o **REAL**. Trazar FE/BFF↔G7, el 403 entre cuentas y el timeout con autorización específica, y registrar la revisión de G-AUTH y G-ADDRESS. Cotización **MOCK**.
- [ ] Confirmar que el broker RabbitMQ de G1 esté accesible desde G7 para publicar y desde el consumidor desplegado de G1, con credenciales separadas. Registrar prueba **REAL** con traza de recepción, duplicados y recuperación.
- [ ] Aplicar la migración de [BE #357](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/357) y verificar `shipment_event_inbox` en el entorno del receptor desplegado.
- [ ] Cargar `VENTAS_WEBHOOK_TOKEN` en Render por canal seguro y verificar la entrega autenticada con Ventas. Conservar solo metadatos sanitizados.
- [ ] Adjuntar reportes autorizados de performance/APIM. Para el punto 4, registrar trazas de ambos intercambios con su resultado **REAL** o **MOCK** y consignar cada prueba pendiente con responsable, siguiente paso y fecha.
- [ ] Verificar compra A/B **REAL** tras la integración de Ventas de [BE #133](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/133) y recepción **REAL** de ambos correos tras el despliegue de las plantillas por Seguridad ([BE #322](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/322)).
- [ ] Anexar acta de ensayo [#326](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/326) y paquete [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324). Registrar riesgos aceptados, decisión de liberar o mantener la versión anterior y firmas de Jim y Andrés.
- [ ] El viernes 27/11, registrar la etiqueta efectiva de release, su enlace y el SHA del candidato aprobado y firmado.

Estado de [#327](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/327): checklist preparado. El congelamiento, la firma y la etiqueta del candidato siguen pendientes para el viernes 27/11.
