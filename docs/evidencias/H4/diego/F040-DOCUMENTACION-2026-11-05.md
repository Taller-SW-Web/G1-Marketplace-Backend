# F-040 Registrar evaluación postentrega — trazabilidad documental

Fecha: 05/11/2026. Issue: [#199](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/199). PR: [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). Responsable: Diego Espinoza. Revisor pendiente: Fernando Saire (`saire22`).

## Estado y fuentes

La implementación y pruebas propias de G1 están preparadas para revisión. La integración REAL y el ciclo durable del prompt continúan bloqueados en [#197](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/197).

| Capa | Fuente |
|---|---|
| Funcional | [F-040](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/funcional/F-040-evaluacion-postentrega.md) |
| Contrato API | [POST CSAT](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/contrato-api/F-040-evaluacion-postentrega.md) |
| React/UI | [Componente F-040](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/componentes-react/F-040-evaluacion-postentrega.md) y [O-009](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/ui/overlays/O-009-evaluacion-postentrega.md) |
| Código | `src/csat`, `prisma/schema.prisma` y migraciones de `PostDeliveryPrompt` |
| Pruebas | `test/csat.e2e-spec.ts`, `test/csat.integration-spec.ts`, `src/config/environment.spec.ts` |
| QA | [#198](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/198) y [evidencia de seguridad](F040-QA-SEGURIDAD-2026-11-05.md) |

## Contrato implementado

`POST /api/v1/orders/{orderId}/csat` acepta `sentiment` (`GOOD`, `REGULAR`, `BAD`), hasta diez motivos opcionales y comentario opcional de hasta 1000 caracteres. El BFF deriva `clienteId` del JWT, fija `canal=MARKETPLACE`, verifica pedido propio `ENTREGADO` y adapta el sentimiento a 5/3/1.

G1 no almacena la evaluación. Ventas/Postventa es la autoridad de CSAT; localmente sólo se actualiza `PostDeliveryPrompt` después de `201` o del duplicado canónico `409 CSAT_ALREADY_SUBMITTED`. Un timeout, `5xx`, conflicto desconocido o respuesta inválida conserva el estado anterior y no dispara retry automático.

## Motivos: propuesta para revisión de Producto/UX

Se propone formalizar el catálogo mínimo ya utilizado únicamente por la demo:

| Sentimiento | Código | Etiqueta de cliente |
|---|---|---|
| `GOOD` | `ENTREGA_RAPIDA` | Llegó a tiempo |
| `GOOD` | `BUEN_ESTADO` | Producto en buen estado |
| `REGULAR` | `COMUNICACION` | Comunicación por mejorar |
| `REGULAR` | `EMPAQUE` | Empaque por mejorar |
| `BAD` | `RETRASO` | Entrega tardía |
| `BAD` | `DANOS` | Producto dañado |

Política propuesta:

- motivos opcionales, máximo diez, únicos y compatibles con el sentimiento visible;
- cambiar sentimiento limpia motivos incompatibles, pero conserva el comentario;
- el BFF valida formato y serializa los códigos como texto legible en `comentario` mientras G5 no publique un campo estructurado;
- ninguna puntuación baja crea reclamo automáticamente;
- el frontend conectado mantiene catálogo vacío hasta que Producto/UX apruebe esta tabla. La demo no constituye homologación.

## Política de descarte sin transición persistente inventada

Hasta resolver G-PROMPT:

- “Ahora no”, cerrar y Escape sólo cierran el overlay y descartan el borrador en memoria de esa vista;
- logout, cambio de cuenta o abandono elimina sentimiento, motivos y comentario de memoria;
- G1 no envía una mutación de descarte y no cambia el prompt a `DISMISSED`;
- volver a invitar o no depende del futuro productor/contrato del prompt, no de `localStorage` ni de una inferencia del navegador;
- únicamente `201` o `409 CSAT_ALREADY_SUBMITTED` permiten marcar `SUBMITTED`;
- los estados `ELIGIBLE`, `SHOWN` y `DISMISSED` existentes en el modelo no autorizan por sí solos endpoints o transiciones. El flujo actual sólo consume un `SHOWN` creado por fixture/control externo autorizado.

Esta política resuelve el comportamiento seguro de G1 mientras G-PROMPT permanece abierto, sin afirmar que el descarte fue guardado.

## Errores públicos

| Caso | Respuesta | Cambio local |
|---|---|---|
| Request/orderId inválido o campos extra | `400 INVALID_REQUEST` | Ninguno |
| Sin identidad válida | `401 UNAUTHORIZED` | Ninguno |
| Pedido ajeno | `403 ORDER_FORBIDDEN` | Ninguno |
| Pedido inexistente/no disponible | `404 ORDER_NOT_AVAILABLE` | Ninguno |
| Pedido no entregado | `422 ORDER_NOT_DELIVERED` | Ninguno |
| Prompt no elegible | `409 PROMPT_NOT_ELIGIBLE` | Ninguno |
| Ya enviado local o duplicado canónico | `409 CSAT_ALREADY_SUBMITTED` | Duplicado canónico reconcilia a `SUBMITTED` |
| Proveedor/timeout/resultado incierto | `503 SALES_UNAVAILABLE` | Conserva estado; sin retry |
| Gates apagados | `503 CSAT_UNAVAILABLE` | Ninguno |

## Matriz spec → código → pruebas → resultado → integración

| Criterio | Código | Prueba | Resultado local | Gate REAL |
|---|---|---|---|---|
| CA-F040-01: sólo pedido entregado | `SalesCsatGateway.assertDelivered` | pedido ajeno/no entregado/malformado | PASS controlado | I-03 |
| CA-F040-02: no reenviar duplicado | `CsatService.submit` | replay local y duplicado canónico | PASS | I-04 |
| API-CA-F040-01: 5/3/1 | DTO/servicio/gateway | tabla GOOD/REGULAR/BAD | PASS | I-04 |
| API-CA-F040-02: `422`/`409` | gateway y reconciliación | errores externos y concurrencia | PASS | I-04 |
| Prompt propio `SHOWN` | consulta compuesta cliente/pedido | prompt ausente/otro estado | PASS con fixture | G-PROMPT |
| Sin rating/PII local | update limitado a estado/timestamps | XSS como texto y PostgreSQL | PASS | Revisión/DAST |
| Descarte | cierre/borrador sólo en UI | QA frontend #96 | En revisión | G-PROMPT |

## Condiciones de liberación de gates

- **I-03:** URL/revisión de Ventas, JWT humano autorizado, pedido propio y ajeno, `ENTREGADO`/no entregado, respuestas sanitizadas y `X-Correlation-Id` verificables.
- **I-04:** proveedor/versionado de `/api/v2/csat`, `201`, `403`, `422`, duplicado canónico, timeout sin retry y unicidad confirmados en entorno autorizado.
- **G-PROMPT:** dueño del productor, fuente de entrega, operaciones permitidas, reglas de reaparición/expiración, concurrencia y endpoints/eventos de `SHOWN`/`DISMISSED` publicados antes de persistirlos.

## Pendientes para cierre integral

1. Aprobación de Producto/UX para catálogo y obligatoriedad de motivos.
2. Aprobación de la política de descarte o publicación del contrato G-PROMPT que la sustituya.
3. Evidencia REAL de I-03/I-04 y deployment identificado.
4. Aprobación final de Backend #198, Frontend #96 y revisión independiente.

El trabajo documental propio puede pasar a revisión. La función no debe marcarse integrada, desplegada ni terminada mientras estos gates continúen abiertos.
