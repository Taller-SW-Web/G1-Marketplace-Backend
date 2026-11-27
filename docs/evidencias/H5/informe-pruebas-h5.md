# Informe de pruebas H5 — consolidación de evidencia

**Estado:** borrador consolidado para #324/#392; incluye la selección trazable de 15 casos. La decisión go/no-go y la aprobación del PO continúan pendientes. Hay evidencia REAL publicada de compra y BFF, además de evidencia de RabbitMQ G7, webhook, laboratorio, performance y cobertura.
**Corte de evidencia congelada:** viernes 27 de noviembre de 2026, 15:00 (America/Lima).
**Compra de referencia:** `PED-2026-00092`.

## 1. Resumen ejecutivo y alcance

El informe consolida evidencia H5 disponible para el corte y enlaza los reportes por tema. Se verificó en `develop` la compra REAL con Ventas (`PED-2026-00092`) y la ronda autorizada por el BFF (19/19 casos, sin fallos ni 429). El índice publicado distingue esas corridas de pruebas MOCK y LAB LOCAL.

El informe contiene una selección de 5 casos funcionales MOCK/LOCAL, 5 de integración REAL reportados y 5 de performance LAB LOCAL en [la tabla de #392](392-casos-15.md). La recomendación final aún requiere revisión del PO. Cuenta B (403), CSAT y `DESPACHADO`/`ENTREGADO` reales del pedido 00092 siguen pendientes.

## 2. Entorno y versiones probadas

| Evidencia | Entorno / versión reportada | Referencia |
|---|---|---|
| Compra y lecturas con Ventas | BFF con SHA `f17896d`; horas del 26/11 en America/Lima (UTC−5); pedido confirmado por Ventas | [Informe REAL fusionado en Backend develop](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real) |
| Ronda Seguridad por BFF | 26/11 16:00:23–16:00:32; cuenta A con autorización de G7 | [Reporte sanitizado BFF](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/evidencias/H5/integracion-real/bff/2026-11-26/REAL-2026-11-26T21-00-23.847Z-7f8fc4c5.md) |
| Cobertura Backend CI | `develop` SHA `2c359be`, run exitoso; auditoría posterior reporta cifras de una rama aparte | [Run BE #45772947134](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45772947134) · [auditoría](291-292-137-cobertura.md) |
| Cobertura Frontend CI | PR #174, SHA `f0678f6`, run exitoso y artefacto publicado | [Run FE #45843117746](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45843117746) |
| Performance k6 | Docker local con terceros G5/G6/G7 simulados | [Reporte k6](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/154ecf03eed9cc0d50c5b81b10294c37dc2c1e02/docs/evidencias/H5/performance/be-391/reporte-final.md) |

## 3. Resultados por tipo y capa

| Tipo / capa | Resultado | Etiqueta y límite |
|---|---|---|
| Integración Backend: compra, lectura e idempotencia | Pedido 00092 creado, pagado y leído; reintento no duplicó el pedido | Ventas REAL; cotización y revalidación MOCK |
| Seguridad / integración BFF | Ronda cuenta A 19/19, 0 fallos, sin 429 | REAL para la ventana y alcance reportados; no incluye alta de cuenta ni MFA |
| Integración asíncrona | G7 publicó `usuario.creado` v1; tres mensajes originales de DLQ se recuperaron manualmente y se persistieron con una fila por ID | REAL controlado; no demuestra consumo automático de una nueva publicación ni retry/backoff automático |
| Webhook de despacho | Siete eventos persistidos y token inválido rechazado con 401 | REAL reportado; esos eventos no están asociados al pedido 00092 |
| Frontend E2E (#138) | Dos casos Playwright locales: éxito y error con fixtures; el intento REAL se detuvo en autenticación | MOCK para los dos casos Playwright; #138 quedó cerrada con evidencia parcial; no equivale a compra REAL |
| Performance (#396) | Cinco casos `CP-PERF-01` a `CP-PERF-05` están enlazados individualmente en la [tabla de #392](392-casos-15.md) y en el reporte | LAB LOCAL / terceros simulados; no son integración real |
| Contract tests y proveedor | Snapshots offline y pruebas con servidor/datos sintéticos | MOCK / local; no usar como integración REAL |

El índice más abajo contiene los enlaces por evidencia, estado y limitaciones. El conjunto seleccionado y sus resultados aparecen en la [tabla de 15 casos](392-casos-15.md); no sustituye el estado individual de las 40 F de la matriz #291/#299.

## 4. Defectos e incidencias observadas

En los intentos iniciales de compra se registraron un 429 durante el arranque en frío y un `409 ORDER_CREATION_PENDING` por el límite de tiempo entre BFF y Ventas; el índice REAL enlaza los informes y las correcciones asociadas a BE #397 y #387. No se consideran silenciosamente casos aprobados.

Los escenarios pendientes de cuenta B (esperado 403), CSAT y estados de despacho del pedido 00092 están registrados como pendientes, no como fallos observados.

## 5. Cobertura y métricas

- Backend: el run de `develop` publicó `backend-coverage-report`. La auditoría sobre la rama con cambios de favoritos y CSAT reporta 75.04% de líneas y 68.51% de ramas. No atribuir esas cifras al artefacto del run de `develop` sin cotejar el artefacto exacto.
- Frontend: el run publicó `frontend-coverage-report` con reportes Vitest; los porcentajes aún deben extraerse del artefacto.
- BE #392 señala meta orientativa de ramas ≥80%; la auditoría Backend citada queda por debajo en ramas.

## 6. Riesgos residuales

- Obtener logs con `correlation-id` visible en una corrida REAL y completar los runs de las 40 F; `requestId`/`eventId` no bastan por sí solos.
- Adjuntar evidencia de cuenta B 403, CSAT y `DESPACHADO`/`ENTREGADO` reales del pedido `PED-2026-00092`.
- Integrar al branch objetivo las PR #354/#358 (matriz y contratos G6) y enlazar el C4 y contratos de eventos aprobados desde SPECS.
- Extraer métricas FE, completar DAST y consolidar defectos y bloqueos con fuente primaria.

## 7. Recomendación go/no-go

**Pendiente de decisión.** Los 15 casos están compilados y enlazados; falta que el PO revise la evidencia, acepte los límites MOCK/LAB LOCAL y decida cómo tratar los riesgos residuales. No se declara GO ni NO-GO mientras falte esa validación. BE #392 sigue abierto.

Este índice organiza la evidencia de extremo a extremo para la exposición. Cada responsable debe reemplazar `Pendiente` con enlaces permanentes a los runs, reportes y tablas originales. Conservar fecha/hora, ambiente, commit o versión, resultado y responsable; no copiar secretos ni datos personales. Si una prueba no aplica o falla, registrarlo explícitamente con su causa y enlace.

## Índice por punto

| Prioridad | Punto | Documento | Estado |
|---|---|---|---|
| 1 | [#324 — Paquete de evidencia H5](#1-324-paquete-de-evidencia-h5) | Este índice | Parcial; enlaces primarios pendientes |
| 2 | [#299 — Trazabilidad F → prueba → run](299-trazabilidad.md) | [Trazabilidad](299-trazabilidad.md) | PR #354 (HTTP/F matrix) y #390 (consumer correlation) tienen CI; falta merge, runs por F y correlationId REAL |
| 3 | [#325 — Arquitectura C4](325-arquitectura-c4.md) | [C4](325-arquitectura-c4.md) | Tres vistas de trabajo agregadas; requiere revisión de Arquitectura y datos de despliegue/APIM |
| 4 | [#321 — Contrato de eventos](321-contrato-eventos.md) | [Contrato y diagramas A/B](321-contrato-eventos.md) | Acuerdos #20/#22 y esquemas enlazados; falta correlación REAL y enlace de runs post-fix |
| 5 | [#293 — Contract tests de Productos](293-contract-tests-productos.md) | [OpenAPI y contract tests](293-contract-tests-productos.md) | PR #354/#358 aprobadas y CI verde en `main`; integrar al branch objetivo; sin runtime REAL |

### Matriz, cobertura y decisión go/no-go

Los puntos complementarios BE #291, BE #292, FE #137 y BE #392 se incorporan en [matriz de integración y reportes de cobertura](291-292-137-cobertura.md) y [go/no-go](392-go-no-go.md). La existencia de un run de cobertura no sustituye los 15 casos trazables ni la recomendación final del PO.

### Evidencia relacionada de Ventas (#295)

Los contract tests de Ventas aportan contexto al paquete, pero no sustituyen BE #293 (OpenAPI de Productos y Ofertas). El detalle y los límites están en [#295 — Contract tests de Ventas](295-contract-tests-ventas.md).

## Evidencia de performance

La re-medición móvil del despliegue de `develop` (SHA `93fdc79f…`) del 26 de noviembre está resumida en [Lighthouse móvil — despliegue del corte H5](performance-2026-11-26.md), con enlaces directos a cada reporte de PageSpeed Insights.

## 1. #324 — Paquete de evidencia H5

La secuencia de negocio de referencia es la compra real `PED-2026-00092`, reportada por los líderes. Los requestId/eventId documentan saltos concretos, pero todavía no acreditan un `correlation-id` de extremo a extremo.

| Evidencia | Run / fuente | Reporte | Resultado verificado | Estado / límite |
|---|---|---|---|---|
| Compra real `PED-2026-00092` | [Informe integrado en develop](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real#compra-real-con-ventas-be-380-397-387); [reporte 6afb7c7c](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/evidencias/H5/integracion-real/compra/2026-11-26/REAL-2026-11-26T20-05-16.062Z-6afb7c7c.md); commit del BFF `f17896d` | README fusionado; horas Lima (UTC−5), `requestId` y pasos anteriores también documentados | `PROD-101`; 139,90 PEN; POST `/api/v1/checkout/orders` 15:06:11→202; `PAGADO` confirmado 15:17:04; lecturas `/api/v1/orders/me` y `/api/v1/orders/PED-2026-00092` 15:26→200; reintento 15:46:09→202, mismo pedido sin duplicado | Ventas REAL; token/dirección G7 REAL; cotización y revalidación MOCK; `DESPACHADO` y `ENTREGADO` del pedido siguen pendientes |
| Ronda BFF con cuenta A | [Informe integrado en develop](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/tree/develop/docs/evidencias/H5/integracion-real#ronda-por-el-bff-con-seguridad); [reporte 7f8fc4c5](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/develop/docs/evidencias/H5/integracion-real/bff/2026-11-26/REAL-2026-11-26T21-00-23.847Z-7f8fc4c5.md) | README fusionado; ventana en hora de Lima | 26/11 16:00:23–16:00:32; 19/19 OK, 0 fallos, sin 429; autorizada por G7 | Evidencia REAL publicada; omitió registro de cuenta nueva y rama MFA |
| Evento G7 en RabbitMQ | [BE #313](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/313) / [acuerdo G7 SPECS #22](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/22) | Outbox y lectura manual | `usuario.creado` v1; evento `5206c121-61e7-4de9-8fe9-0b11306c0daa`, leído de `marketplace.usuarios` y cotejado con outbox el 25/11 23:07 | REAL reportado; falta permalink al comentario fuente de #313 |
| Consumidor G7 / recuperación desde DLQ | [BE #314, actualización REAL](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314#issuecomment-7205557701) y [BE #315](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/315) | Consulta PostgreSQL de solo lectura reportada | Tres mensajes originales recuperados manualmente con candidato #409; una fila por ID; cuatro filas/cuatro IDs distintos contando la prueba previa | REAL controlado; no demuestra nueva entrega automática, replay automático ni backoff |
| Webhook de despacho desde Ventas (`ShipmentStatusUpdated`) | BE #318 ([issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/318)); permalink de run/comentario: Pendiente | Reporte primario: Pendiente | 7 eventos persistidos entre 11:05:47–11:05:50 (5 `DESPACHADO`, 2 `ENTREGADO`); token incorrecto rechazado con 401 | REAL reportado; pedido al que pertenecen esos eventos: Pendiente |
| Reintento de correo C-002 | BE #162 ([issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/162)); permalink de run: Pendiente | Reporte primario: Pendiente | `PED-2026-90001`, evento `c53403f0-a940-44d6-a3f1-4652d301e99a`; envío 17:07:59 y reintento 17:09:12 marcado `duplicate:true`; llegó un solo correo | REAL reportado; evidencia complementaria, no el pedido `00092` |
| Contract tests de Ventas | [PR #344](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/344), merge `dc66208`; enlace directo a CI: Pendiente | [Detalle #295](295-contract-tests-ventas.md) | Snapshots OpenAPI offline 6/6; provider local con datos/token sintéticos | Aporta contexto; no equivale a Productos/Ofertas ni a Ventas REAL |
| Consumidor — pruebas de laboratorio | `H5-evidencia-consumidor-Leonidas.md`; URL del archivo/run: Pendiente | La evidencia documenta RabbitMQ 4.1 y PostgreSQL 16 desechables | Eventos sintéticos; duplicado y recuperación de conexión; ensayo separado con reintentos/DLQ | LAB LOCAL; no presentarlo como integración REAL |
| k6 — cinco casos de performance | [BE #396, fusionado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/396) | [CP-PERF-01..05: reporte, pasos y resultados](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/154ecf03eed9cc0d50c5b81b10294c37dc2c1e02/docs/evidencias/H5/performance/be-391/reporte-final.md#casos-de-performance-para-be-392); [datos JSON](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/154ecf03eed9cc0d50c5b81b10294c37dc2c1e02/docs/evidencias/H5/performance/be-391/datos-finales.json) | Cinco casos con precondiciones, pasos, resultados y evidencia; IDs incluidos en [la tabla de #392](392-casos-15.md) | Docker local; G5/G6/G7 simulados; no es integración REAL |
| E2E FE #138 carrito/checkout | [FE #138, cerrada parcial](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/138); [run Playwright CI](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45902315375/job/140190792229) | Reporte HTML/trazas locales descritos en #138 | Dos casos Playwright MOCK (éxito y error); intento REAL se detuvo con `401 CREDENCIALES_INVALIDAS`, sin crear pedido | Evidencia parcial; no cumple el E2E multi-módulo completo |
| Matriz de integración BE #291 | [Matriz F-001..F-040 de PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/aeac35ff99d8bf5a685c6ce43cb5fd2fec8add5e/docs/evidencias/H5/MATRICES-TASK-H5-291-299.md) | [Evidencias adicionales y límites](291-292-137-cobertura.md) | Módulos G6, G7, G5 y G2; conserva `LOCAL`, `PIN`, `BLOCKED`, `NOT-COVERED` | Incorporar evidencia adicional al ID de caso y run cuando la matriz se integre al branch objetivo |
| Cobertura backend BE #292 | [Run de develop #45772947134](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45772947134) | [Auditoría de cobertura](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/b67261f6a19c29a87d368e63e4fc6c32612545f8/docs/evidencias/H5/diego/TASK-H5-TEST-002-COBERTURA-BE.md) | Artefacto `backend-coverage-report`; auditoría de rama reporta 75.04% líneas y 68.51% ramas tras ajustes de favoritos y CSAT | Mantener distinto el artefacto de develop y los porcentajes documentados en la rama |
| Cobertura frontend FE #137 | [Run CI #45843117746](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45843117746) | Artefacto `frontend-coverage-report` | Run de rama `ci/h5-137-vitest-coverage` reportado como exitoso; Vitest cubre componentes y servidor | Recuperar/enlazar el artefacto y sus métricas antes del corte |
| Go/no-go BE #392 | [Issue BE #392](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/392) | [Informe](392-go-no-go.md) · [tabla 15 casos](392-casos-15.md) | 15 casos seleccionados con pasos, expectativa, resultado y etiquetas | Decisión pendiente de revisión del PO y tratamiento de riesgos de salida |
| Cuenta B, denegación de pedido ajeno | Run/log: Pendiente | Pendiente | Se espera 403; evidencia aún no recibida | Pendiente |
| CSAT | Run/reporte: Pendiente | Pendiente | Escenario pendiente de evidencia | Pendiente |
| `DESPACHADO` y `ENTREGADO` REAL de `PED-2026-00092` | Run/log de Ventas/webhook: Pendiente | Pendiente | README fusionado indica que ambos estados del pedido están pendientes | Pendiente |
| SAST Backend | [Run #45772947134](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45772947134) y [check del PR #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45910280893/job/140216718408) | Semgrep/SARIF | Job pasó | Evidencia Backend disponible; registrar alcance y commit probados |
| DAST Backend | [OWASP ZAP Baseline en PR #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45910280872/job/140216718161) | [Check del PR #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/408) | Pasó contra staging propio | Añadido al corte; no representa otros entornos |

### Correlación del paquete

| Campo | Valor / enlace |
|---|---|
| ID de compra | `PED-2026-00092` |
| `correlation-id` de extremo a extremo | Pendiente; los valores recibidos son `requestId` y `eventId`, no se ha mostrado aún el `correlation-id` en logs |
| Request IDs de Ventas/BFF | `e1e1933f-0510-4918-af56-34d3a588f064` (POST); `d1750523-fd6b-43f6-b8ac-e9e64a55ee9f` (GET `/orders/me`); `103f155a-6040-4fa9-89de-f7f39fa7ab1e` (GET por pedido); `132ea7e8-9bdc-46ca-af2a-c0a96a6d2c57` (reintento idempotente) |
| Ambiente y ventana temporal | Compra REAL, 26/11; horas reportadas en tabla (zona horaria pendiente de confirmar) |
| Commit / release probado | `f17896d` para compra; SHA del deploy BFF: Pendiente |
| Carpeta de reportes congelados | Pendiente |
| Tabla consolidada de resultados | Pendiente |

## Criterio de congelamiento

Antes del corte, cada entrada debe apuntar a la fuente primaria y declarar `PASS`, `FAIL`, `BLOCKED`, `LAB LOCAL` o `N/A`, junto con hora, zona horaria, ambiente y versión probados. Las evidencias comunicadas por los líderes quedan registradas, pero el paquete sigue parcial hasta añadir los permalinks sanitizados de reportes/comentarios donde hoy figuran como pendientes. El índice debe permitir navegar desde la compra hasta BFF, webhook, consumidor, k6, SAST y DAST sin inferir resultados ausentes.

## Aprobaciones

| Aprobación | Estado | Evidencia |
|---|---|---|
| Giuliano — FE #142: DS-001 y SPECS #23 | Aprobación pendiente | [Issue FE #142](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/142); el comentario de solicitud ya fue publicado (se reportaron dos comentarios duplicados); falta confirmación de Giuliano |
