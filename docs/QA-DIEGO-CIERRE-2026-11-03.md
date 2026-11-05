# QA y trazabilidad de Diego — Backend — 03/11/2026

Alcance: issues asignadas a DiesmEsp. Este documento actualiza evidencia local; no acredita integración REAL, aprobación independiente ni cierre.

PR principal: [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). PR complementario: [Frontend #118](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118) / [Backend #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

## Validación local de los puntos 1–5

| Control | Resultado actual | Límite |
|---|---|---|
| Frontend componentes / BFF | 257 / 111 aprobados | Proveedores controlados; no son pruebas externas REAL. |
| UI favoritos/CSAT | 17 E2E aprobados | Incluye logout, Escape, motivos, borrador, duplicado, XSS en texto y responsive 1440/390/320; demo/DTO controlados. |
| E2E navegador→Next→Nest→PostgreSQL | 7 aprobados | Identidad/catálogo controlados, Ventas/Postventa loopback y SHOWN fixture. |
| Backend unitarias / HTTP | 229 / 225 aprobados | 17 HTTP omitidas por entorno; 13 de sesiones se ejecutaron aparte. |
| PostgreSQL 16 temporal | 41 integración + 13 sesiones aprobadas | Cuatro migraciones; redeploy sin pendientes; contenedor propio eliminado. |
| Scripts auth/probe | 4 + 6 aprobados | Contratos locales; no certifican despliegue. |
| Build / typecheck / lint | Aprobados según repositorio | Frontend build incluye tipos; backend build/typecheck. |

La suite HTTP necesitó una DATABASE_URL ficticia local para arrancar; no se usó una base compartida. Los EPERM/SWC del sandbox se reintentaron con autorización. En la primera UI hubo un selector ambiguo de alertas y un timeout de navegación bajo carga; se corrigió el selector, los dos casos pasaron aislados y la ejecución final completa dio 17/17. Un intento del runner conectado chocó con el Next de UI; se repitió secuencialmente y pasó 7/7. No se suman intentos fallidos a los resultados aprobados.

## Fronteras que permanecen abiertas

No hay reviews registradas en los PR funcionales al corte. No se certificó G6/G7/G5 REAL, despliegue, DAST externo ni productor de prompt autorizado. F-039 conserva la decisión implementada de agregar sin quitar; la redacción FE/BE/SPECS requiere aceptación coherente. Los mocks no liberan gates. El trabajo no implementa sistemas asignados a otros integrantes.

No se cierra una issue por tener código, un PR o CI verde: deben cumplirse su corte y definición de terminado. Las revisiones de Fernando/Jim no se sustituyen por autorrevisión de Codex.

## Cómo repetir

Frontend: `npm run test:components`, `npm run test:server`, `node node_modules/@playwright/test/cli.js test --config playwright.diego-closure.config.ts`. El config usa puerto 3347 y servidor exclusivo; la suite queda excluida del Playwright predeterminado porque requiere sandbox.

Backend: `npm run test:unit`, `npm run test:e2e` con configuración local explícita y `npm run test:diego:isolated` con Docker. Desde frontend: definir H4_BACKEND_DIR hacia el candidato backend y ejecutar `npm run test:e2e:h4:connected`. Ejecutar los servidores Next sobre un mismo checkout de forma secuencial.


## Seguridad del corte

- SAST: 0 hallazgos/0 errores; 130 archivos src/scripts, cuatro reglas locales. No es una certificación OWASP exhaustiva.
- Gitleaks fuente: 0 hallazgos en snapshot de 245 archivos fuente/documentación/tests según Git, sin node_modules, cachés o .env privados.
- SCA total: 18 moderadas, 3 bajas, 0 altas/críticas. SCA runtime: 0 vulnerabilidades reportadas.
- Las moderadas de herramientas de desarrollo requieren análisis/aceptación; no se aplican downgrades mayores automáticos.
- DAST externo pendiente de entorno y ventana autorizados. El test XSS local no lo sustituye.
- Artefactos: backend dist sin hallazgos; Next contiene claves de build en metadatos privados que se clasifican por la política existente, sin publicar sus valores. Ver resumen sanitizado del artefacto del corte; no distribuir cachés ni reportes crudos.


## Mapa issue → PR → sección → código/prueba

Los enlaces son trazabilidad explícita. No se afirma que GitHub haya establecido una asociación nativa en Development. Se conservan las issues abiertas mientras falte su DoD; no se añaden palabras de cierre automático prematuro.

<a id="issue-219"></a>
### [#219](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/219) — TASK-TRANS-S03-DOC-002

**Sección:** Reestimación y confirmaciones. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [docs/evidencias/H4/diego/REESTIMACION-2026-11-03.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/evidencias/H4/diego/REESTIMACION-2026-11-03.md)

**Avance:** Seguimiento documental y/o pruebas locales relacionadas; no se declara ejecutada la batería externa pendiente.

**Falta para cierre:** Reestimación condicionada preparada; falta confirmación de capacidad/fechas del equipo, proveedor de evento, autorización de carga y revisión de Jim.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-214"></a>
### [#214](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/214) — TASK-TRANS-S02-QA-002

**Sección:** Matriz individual de integración. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [docs/QA-DIEGO-CIERRE-2026-11-03.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/QA-DIEGO-CIERRE-2026-11-03.md)

**Avance:** Seguimiento documental y/o pruebas locales relacionadas; no se declara ejecutada la batería externa pendiente.

**Falta para cierre:** Matriz local preparada; faltan casos/trazas/provider REAL por función y revisión de Fernando.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-208"></a>
### [#208](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/208) — TASK-TRANS-S02-DOC-002

**Sección:** Seguimiento 40 funciones. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [docs/evidencias/H4/diego/SEGUIMIENTO-2026-11-03.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/evidencias/H4/diego/SEGUIMIENTO-2026-11-03.md)

**Avance:** Seguimiento documental y/o pruebas locales relacionadas; no se declara ejecutada la batería externa pendiente.

**Falta para cierre:** Snapshot actualizado de 40 funciones preparado; falta confirmar por operación contrato/entorno/datos/grants/escalamientos con los responsables y revisión de Jim.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-199"></a>
### [#199](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/199) — TASK-F040-DOC-001

**Sección:** Evaluación postentrega. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [docs/QA-DIEGO-CIERRE-2026-11-03.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/QA-DIEGO-CIERRE-2026-11-03.md), [docs/evidencias/H4/diego/EVIDENCIA.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/evidencias/H4/diego/EVIDENCIA.md)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. I-03/I-04/G-PROMPT y motivos/política de descarte sin homologación final; no se inventan transiciones durables.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-198"></a>
### [#198](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/198) — TASK-F040-QA-002

**Sección:** Evaluación postentrega. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/csat/csat.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/csat/csat.service.ts), [test/csat.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/csat.e2e-spec.ts), [test/csat.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/csat.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. DAST aplicable no ejecutado sobre destino externo; moderadas de desarrollo pendientes de aceptación. I-03/I-04/G-PROMPT y motivos/política de descarte sin homologación final; no se inventan transiciones durables.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-197"></a>
### [#197](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/197) — TASK-F040-INT-001

**Sección:** Evaluación postentrega. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/csat/csat.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/csat/csat.service.ts), [test/csat.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/csat.e2e-spec.ts), [test/csat.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/csat.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Contrato/configuración, grants, datos, proveedor REAL y gates; después revisión y despliegue. Un loopback HTTP no cierra INT. I-03/I-04/G-PROMPT y motivos/política de descarte sin homologación final; no se inventan transiciones durables.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-196"></a>
### [#196](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/196) — TASK-F040-DB-001

**Sección:** Evaluación postentrega. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [prisma/schema.prisma](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/prisma/schema.prisma), [scripts/test-diego-isolated.mjs](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/scripts/test-diego-isolated.mjs), [test/csat.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/csat.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. I-03/I-04/G-PROMPT y motivos/política de descarte sin homologación final; no se inventan transiciones durables.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-195"></a>
### [#195](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/195) — TASK-F040-BE-001

**Sección:** Evaluación postentrega. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/csat/csat.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/csat/csat.service.ts), [test/csat.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/csat.e2e-spec.ts), [test/csat.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/csat.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. I-03/I-04/G-PROMPT y motivos/política de descarte sin homologación final; no se inventan transiciones durables.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-194"></a>
### [#194](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/194) — TASK-F039-DOC-001

**Sección:** Agregar al carrito conservando favorito. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [docs/QA-DIEGO-CIERRE-2026-11-03.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/QA-DIEGO-CIERRE-2026-11-03.md), [docs/evidencias/H4/diego/EVIDENCIA.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/evidencias/H4/diego/EVIDENCIA.md)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. Alinear FE mover/quitar con BE conservar favorito y aceptación SPECS #15.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-193"></a>
### [#193](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/193) — TASK-F039-QA-002

**Sección:** Agregar al carrito conservando favorito. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist-cart.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist-cart.service.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. DAST aplicable no ejecutado sobre destino externo; moderadas de desarrollo pendientes de aceptación. Alinear FE mover/quitar con BE conservar favorito y aceptación SPECS #15.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-192"></a>
### [#192](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/192) — TASK-F039-INT-001

**Sección:** Agregar al carrito conservando favorito. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist-cart.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist-cart.service.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Contrato/configuración, grants, datos, proveedor REAL y gates; después revisión y despliegue. Un loopback HTTP no cierra INT. Alinear FE mover/quitar con BE conservar favorito y aceptación SPECS #15.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-191"></a>
### [#191](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/191) — TASK-F039-DB-001

**Sección:** Agregar al carrito conservando favorito. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [prisma/schema.prisma](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/prisma/schema.prisma), [scripts/test-diego-isolated.mjs](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/scripts/test-diego-isolated.mjs), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. Alinear FE mover/quitar con BE conservar favorito y aceptación SPECS #15.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-190"></a>
### [#190](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/190) — TASK-F039-BE-001

**Sección:** Agregar al carrito conservando favorito. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist-cart.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist-cart.service.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. Alinear FE mover/quitar con BE conservar favorito y aceptación SPECS #15.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-189"></a>
### [#189](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/189) — TASK-F038-DOC-001

**Sección:** Quitar y Deshacer. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [docs/QA-DIEGO-CIERRE-2026-11-03.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/QA-DIEGO-CIERRE-2026-11-03.md), [docs/evidencias/H4/diego/EVIDENCIA.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/docs/evidencias/H4/diego/EVIDENCIA.md)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-188"></a>
### [#188](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/188) — TASK-F038-QA-002

**Sección:** Quitar y Deshacer. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist.controller.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist.controller.ts), [test/wishlist.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.e2e-spec.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar. DAST aplicable no ejecutado sobre destino externo; moderadas de desarrollo pendientes de aceptación.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-187"></a>
### [#187](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/187) — TASK-F038-INT-001

**Sección:** Quitar y Deshacer. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist.controller.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist.controller.ts), [test/wishlist.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.e2e-spec.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Contrato/configuración, grants, datos, proveedor REAL y gates; después revisión y despliegue. Un loopback HTTP no cierra INT.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-186"></a>
### [#186](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/186) — TASK-F038-DB-001

**Sección:** Quitar y Deshacer. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [prisma/schema.prisma](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/prisma/schema.prisma), [scripts/test-diego-isolated.mjs](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/scripts/test-diego-isolated.mjs), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-185"></a>
### [#185](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/185) — TASK-F038-BE-001

**Sección:** Quitar y Deshacer. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist.controller.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist.controller.ts), [test/wishlist.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.e2e-spec.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-184"></a>
### [#184](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/184) — TASK-F037-DOC-001

**Sección:** Lectura de favoritos. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [trazabilidad documental vigente de F-037](evidencias/H4/diego/F037-DOCUMENTACION-2026-11-05.md), [evidencia local](evidencias/H4/diego/EVIDENCIA.md) y [handoff frontend](FAVORITOS-FRONTEND-HANDOFF.md).

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** La documentación local de contrato, Figma, decisiones, operación, errores y pruebas está preparada para revisión. La evidencia técnica pendiente corresponde a G6 REAL de #182; después debe incorporarse su versión, datos, trazas y resultados sanitizados.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-183"></a>
### [#183](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/183) — TASK-F037-QA-002

**Sección:** Lectura de favoritos. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [reporte de seguridad F-037](evidencias/H4/diego/F037-QA-SEGURIDAD-2026-11-05.md), [src/wishlist/wishlist-read.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist-read.service.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Aislamiento A/B, cambio de cuenta, identidad manipulada, caché privada, allowlist de respuesta y fallos neutros verificados. El CI del candidato ejecutó build, PostgreSQL 16, suites G7/Favoritos, SAST, SCA y secretos sin hallazgos altos/críticos.

**Falta para cierre:** sólo gates externos: revisión independiente, despliegue identificable por SHA con cuentas A/B autorizadas e integración G6 REAL de #182. El DAST público aplicable está documentado, pero no se atribuye al PR porque el destino no publica SHA.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-182"></a>
### [#182](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/182) — TASK-F037-INT-001

**Sección:** Lectura de favoritos. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist-read.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist-read.service.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Contrato/configuración, grants, datos, proveedor REAL y gates; después revisión y despliegue. Un loopback HTTP no cierra INT.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-181"></a>
### [#181](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/181) — TASK-F037-DB-001

**Sección:** Lectura de favoritos. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [prisma/schema.prisma](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/prisma/schema.prisma), [scripts/test-diego-isolated.mjs](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/scripts/test-diego-isolated.mjs), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-180"></a>
### [#180](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/180) — TASK-F037-BE-001

**Sección:** Lectura de favoritos. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist-read.service.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist-read.service.ts), [test/wishlist-handoff.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist-handoff.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-179"></a>
### [#179](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/179) — TASK-F036-DOC-001

**Sección:** Alta favorita. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [trazabilidad documental vigente de F-036](evidencias/H4/diego/F036-DOCUMENTACION-2026-11-05.md), [evidencia local](evidencias/H4/diego/EVIDENCIA.md) y [conexión con sesión G7](evidencias/H4/diego/G7-FAVORITOS-2026-11-03.md).

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** La documentación local ya incluye specs, Figma, operación y errores. Quedan revisión independiente, casos UI/API desplegados y evidencia G6 REAL de #177; los proveedores controlados no acreditan esos gates.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-178"></a>
### [#178](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/178) — TASK-F036-QA-002

**Sección:** Alta favorita. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [reporte de seguridad vigente](evidencias/H4/diego/F036-QA-SEGURIDAD-2026-11-05.md), [test/wishlist.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.e2e-spec.ts), [test/wishlist.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.integration-spec.ts) y [test/auth-g7.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/auth-g7.e2e-spec.ts).

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** SCA vigente y sondeo público dirigidos ya documentados. Falta identificar/desplegar el SHA candidato, repetir DAST aplicable y casos autenticados A/B sobre ese destino, aceptar o corregir riesgos de desarrollo/cabeceras y obtener revisión independiente.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-177"></a>
### [#177](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/177) — TASK-F036-INT-001

**Sección:** Alta favorita. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist.repository.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist.repository.ts), [test/wishlist.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.e2e-spec.ts), [test/wishlist.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Contrato/configuración, grants, datos, proveedor REAL y gates; después revisión y despliegue. Un loopback HTTP no cierra INT.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-176"></a>
### [#176](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/176) — TASK-F036-DB-001

**Sección:** Alta favorita. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [prisma/schema.prisma](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/prisma/schema.prisma), [scripts/test-diego-isolated.mjs](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/scripts/test-diego-isolated.mjs), [test/wishlist.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.

<a id="issue-175"></a>
### [#175](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/175) — TASK-F036-BE-001

**Sección:** Alta favorita. **PR:** [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239).

**Fuentes:** [src/wishlist/wishlist.repository.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/src/wishlist/wishlist.repository.ts), [test/wishlist.e2e-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.e2e-spec.ts), [test/wishlist.integration-spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/diego-h4-favoritos-csat/test/wishlist.integration-spec.ts)

**Avance:** Casos locales existentes reejecutados con fixtures/proveedores controlados; resultados por suite y límites en el reporte enlazado.

**Falta para cierre:** Revisión independiente y casos UI/API desplegados exigidos por la issue; integración REAL/gates aplicables sin acreditar.

**Decisión:** mantener abierta. No hay aprobación independiente registrada; tampoco evidencia desplegada/REAL completa ni justificación de no aplicabilidad para cerrar el DoD.
