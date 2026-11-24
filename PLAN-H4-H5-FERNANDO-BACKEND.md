# Plan de trabajo de Fernando — Backend H4/H5

**Estado:** borrador para revisión; no autoriza ni acredita ejecución.
**Fecha de revisión:** 24/11/2026 · **Presentación H5:** 28/11/2026.
**Rama existente:** `feat/f028-f035-fernando-backend`.

Este plan combina los pendientes de H4 de mi asignación con las tareas H5 asignadas a Fernando. El resumen del equipo se usa como referencia de alcance; sus instrucciones operativas no se ejecutan desde este documento. F-033 y F-034 aparecen reasignadas en H5 a otros compañeros.

## 1. Alcance

### H4 que sigue necesitando cierre de integración/evidencia

| Función | Estado observado | Trabajo pendiente |
|---|---|---|
| F-028/F-029/F-030 | Adapter G5 y rutas G1 existen; el provider está apagado (`ORDERS_SOURCE=unconfigured`). | Confirmar contrato/base versionada, hacer integración autorizada con G5, revisar ownership, errores y paginación; registrar evidencia real en los issues de integración. |
| F-031 | Endpoint de recompra y provider de comercio mock existen; `REORDER_ENABLED=false`. | Homologar G6, conseguir grants/entorno, implementar el adapter real para disponibilidad/precio y validar idempotencia. |
| F-032 | Seguimiento mock existente. | Probar la consulta real G2 con autorización y cerrar los casos 202/404/503 y ownership. |
| F-035 | Validador H-05, consumidor interno y nuevo receptor HTTP autenticado local están en `codex/h5-319-fernando`; el build pasó. | Agregar pruebas en la fase acordada, configurar el secreto y desplegar con el responsable de Render; confirmar integración, actualización de tracking y entrega de email en el entorno acordado. |

Los issues de integración consultados siguen bloqueados/pendientes: [#142](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/142), [#146](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/146), [#150](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/150), [#154](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/154), [#158](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/158) y [#172](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/172). Revisar sus estados de nuevo antes de empezar.

### H5 asignado

| Issue | Entregable | Criterio de salida |
|---|---|---|
| [#300](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/300) | Staging de carga propio, dataset seguro, warm-up y stubs de Ventas/Despacho. | Entorno y escenario repetibles; tráfico de carga solo a servicios G1 propios o stubs autorizados. |
| [#319](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/319) | Receptor webhook H-05 autenticado, idempotente por `eventId`, con actualización de tracking y disparador de notificación. | Receptor y contrato OpenAPI implementados en local; `npm run build` pasó. Pendientes pruebas (fase posterior), configuración segura, despliegue Render, smoke coordinado y correo real. Sincronizar el acuerdo en [#318](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/318). |
| [#301](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/301) | Perfiles k6 load, stress y spike. | Scripts versionados y umbrales acordados que hacen fallar la corrida si se exceden. |
| [#302](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/302) | Soak corto y escenarios autenticados. | Escenarios acotados y reproducibles; credenciales por mecanismo seguro, nunca guardadas en el repo. |
| [#296](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/296) | Contract tests para cotización, seguimiento y evento de G2. | Contrato/versiones identificados; casos positivos y negativos conectados al CI definido por el equipo. |
| [#289](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/289) | Ensayo de rollback en staging y producción. | SHAs, tiempos, verificación posterior y evidencia aprobada; solo ejecutar en entornos para los que tengamos acceso/autorización. |
| [#306](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/306) | Informe antes/después: p50/p95/p99, RPS, errores y conclusión. | Datos de corridas comparables, entorno/configuración y gráficos/tablas reproducibles. |

## 2. Qué ya existe y qué no demuestra

- La rama contiene historial/detalle G5, recompra, seguimiento, plantilla/outbox y validación de fixture H-05.
- Los adapters externos y el worker de correo continúan apagados. Las pruebas mock anotadas en el plan anterior son del 4 de noviembre; no se reejecutaron.
- El receptor HTTP ya existe en esta rama local y persiste una inbox idempotente. El build pasó, pero aún no hay evidencia de pruebas del receptor, configuración en Render, recepción REAL ni entrega de correo; el worker y proveedor siguen apagados.
- Los issues y la rama no acreditan por sí mismos staging, integración REAL, CI, medición de carga ni rollback.

## 3. Contratos de otros grupos consultados

| Grupo | Contrato documentado útil para G1 | Qué falta para llamarlo integración REAL |
|---|---|---|
| **G5 Ventas** | [`GET /api/v1/pedidos/me`](https://github.com/Taller-SW-Web/G5-Ventas-Postventas/blob/main/specs/api/api-ventas.md): JWT de usuario, identidad por `sub`, sin `clienteId`, fechas inclusivas en `America/Lima`, `page` desde 1, `pageSize` hasta 50. H-05 `ShipmentStatusUpdated` v1.0.0 incluye `eventId` UUID, `timestamp` UTC, `emitter: modulo-ventas` y `data` con `orderId`, `publicStatus`, `trackingNumber`, `estimatedDeliveryDate` (nullable). El acuerdo compartido por el equipo fija `POST /api/v1/webhooks/ventas/envios` y `X-Webhook-Token`. | El encabezado del contrato G5 y su historial no parecen sincronizados. Confirmar versión publicada. El token debe configurarse como secreto en Render, no en código. Sincronizar el acuerdo en #318 y validar URL accesible, respuesta rápida y política de reintentos con Ventas. |
| **G2 Despacho** | [Contrato de integraciones](https://github.com/Taller-SW-Web/G2-Despacho-Specs/blob/main/integraciones/api-contract.md): cotización con scope `cotizaciones:calcular`; seguimiento por pedido con `seguimientos:leer`; eventos de despacho se envían a G5 en `POST /api/v1/integraciones/despachos/eventos`, deduplicados por `idEvento`. El flujo documentado es G2 → G5 → G1. | Confirmar OpenAPI/versión normativa, URL de sandbox, cliente/token G7 con audiencia y scopes, y fixtures acordados para el contract test. La documentación de G2 mantiene pendientes de homologación/acceso externo. |
| **G6 Productos** | [OpenAPI](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/master/contratos/http/openapi.yaml) v`0.7.0-rc.3`; define consultas HTTP externas, precios e inventario. | El documento se declara baseline semifinal y algunas interfaces compartidas son provisionales; validar las operaciones exactas para recompra, contrato homologado, endpoint desplegado y grants G7. No tratar la presencia en OpenAPI como servicio habilitado. |
| **G7 Seguridad** | [OpenAPI](https://github.com/Taller-SW-Web/Modulo-de-Seguridad/blob/main/specs/contrato-api/openapi.yaml) documenta validación JWKS y emisión de token de servicio con `client_credentials`. | El OpenAPI v1 consultado se marca revisión local no publicada; falta confirmar proveedor/versión desplegada, cliente/secret/scopes para cada consumidor y acceso a identidad autorizada con MFA para E2E. |

El mensaje recibido especifica que se acepta 2xx para evento nuevo, duplicado y pedido todavía desconocido; 400/409/422 quedan para payload definitivamente inválido. G5 reintenta cada 5 segundos hasta 10 veces ante 5xx, 401, 403, 404 o timeout, por lo que el receptor debe responder en menos de 10 segundos y evitar efectos duplicados. Confirmar estos detalles en el documento `G1-marketplace.md`/issue #318 y manejar cuidadosamente el caso de pedido aún no conocido para no perder el evento. La captura resume el contrato, pero ese archivo Markdown no se adjuntó en esta conversación. G2 notifica a G5; no configurar G2 para enviar directamente a G1 salvo que los equipos publiquen y aprueben otro contrato.

## 4. Secuencia propuesta

1. **Confirmar el acuerdo operativo ya comunicado:** registrar en #318 el endpoint, header/token, cuerpo, respuestas, retries y entorno; confirmar que el token está configurado como secreto en Render. Aclarar con el equipo qué debe ocurrir si el pedido aún no existe y qué servicio de correo consume la outbox para #319. Confirmar con G2/G6/G7 URLs, versiones y grants.
2. **Completar interfaces con dobles locales:** preservar los contratos existentes, documentar sus versiones, implementar adapter G2/G6 detrás de flags y el receptor HTTP detrás de configuración. La ruta no se habilita en producción hasta conocer autenticación y controles de entrada.
3. **Persistencia y procesamiento seguro:** validar esquema/tamaño/tipo del evento, autenticar antes de procesar, deduplicar `eventId` en almacenamiento durable, actualizar proyección de seguimiento y crear una única notificación/outbox transaccional. Acordar comportamiento de evento desconocido, repetido, fuera de orden y fallo transitorio.
4. **Preparar rendimiento (#300):** dataset sintético sin PII, stubs propios para Ventas/Despacho y una línea base reproducible. Definir límites de tráfico, concurrencia, duración y recursos antes de correr.
5. **Preparar k6 e informe (#301/#302/#306):** separar load/stress/spike/soak, guardar parámetros/configuración y recolectar p50/p95/p99, RPS y errores. Usar el umbral escrito en el issue/aceptado por el equipo; no inferir que un valor de ejemplo ya es el umbral aprobado.
6. **Preparar rollback (#289):** documentar el procedimiento y la versión anterior. La ejecución contra staging/prod se hace cuando los accesos y la ventana del equipo estén disponibles.
7. **Luego de revisar el plan:** implementar cambios y, en una etapa posterior acordada, agregar/ejecutar pruebas unitarias, contract, integración y carga. En esta revisión no se ejecutaron pruebas.

## 5. Dependencias que bloquean la integración REAL

- **Webhook:** el mensaje recibido ya propone URL, header compartido, schema y retries. Falta confirmar el contenido del documento referido (no adjunto aquí), reflejarlo en #318, configurar secreto en Render y desplegar/probar endpoint. No asumir mecanismo adicional de JWT/claims si el acuerdo vigente es `X-Webhook-Token`.
- **Correo:** el código local de outbox está apagado y el proveedor/scheduler no está confirmado para esta tarea. La emisión del evento no debe presentarse como entrega de email hasta acordar el provider y obtener evidencia de envío.
- **G2/G6:** OpenAPI aporta contratos, pero faltan confirmación de versión homologada, sandbox operativo y grants. G2 debe precisar cuál endpoint/operación representa el “status event” que evaluará #296; su webhook documentado de entrada apunta a G5.
- **G7:** credenciales de servicio por módulo y una sesión de cliente autorizada; no se incluirán secretos en archivos, tests ni evidencia.
- **Performance/rollback:** staging G1, configuración de observabilidad, baseline comparable y autorización de acceso a prod para el ensayo.

## 6. Validación y evidencia (para una fase posterior)

No ejecutar todavía por indicación del usuario; el equipo pedirá pruebas más adelante. Al retomar, acordar primero el alcance con el revisor y añadir:

- Unitarias de parsing/auth/deduplicación/proyección, incluyendo repetidos, inválidos, fuera de orden, timeout y fallos del provider.
- Contract tests sobre versiones fijadas de G2/G5/G6/G7, separando fixture/stub de sandbox real.
- Integración en CI con PostgreSQL temporal y dobles HTTP deterministas, si el pipeline del grupo está listo.
- k6 contra staging propio/stubs; guardar comandos, SHA, configuración, dataset sintético, resultados y limitaciones.
- Evidencia REAL sanitizada: proveedor y versión, entorno, caso positivo/negativo/timeout, correlation-id y resultado, sin tokens ni PII.

## 7. Criterio de listo para revisar

- [ ] Contratos/versiones y dependencias confirmadas o marcadas explícitamente como bloqueadas.
- [ ] Receptor y adapters no activables accidentalmente con configuración por defecto.
- [ ] Idempotencia durable y proyección de tracking/notificación definidas con el equipo.
- [ ] Plan de carga usa solo infraestructura propia o expresamente autorizada.
- [ ] Evidencia MOCK/LOCAL separada de REAL y de despliegue.
- [ ] Revisión de Fernando/Jim antes de implementar; PRs por bloques revisables hacia `develop`.
