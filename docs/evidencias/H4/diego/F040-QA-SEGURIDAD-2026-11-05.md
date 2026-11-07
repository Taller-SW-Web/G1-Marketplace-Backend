# F-040 — QA seguridad / DevSecOps

Fecha: 05/11/2026. Issue: [#198](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/198). PR: [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). Responsable: Diego Espinoza. Revisor pendiente: Fernando Saire (`saire22`).

## Alcance y fronteras

Este corte verifica el BFF CSAT con identidad, persistencia y proveedores controlados, más PostgreSQL 16 temporal. No se presenta como integración REAL con Ventas/Postventa ni como DAST de producción. Los flags `CSAT_ENABLED`, `CSAT_INTEGRATION_APPROVED` y `CSAT_PROMPT_APPROVED` permanecen apagados hasta homologar I-03, I-04 y G-PROMPT.

El DAST intrusivo sobre Render productivo no está autorizado por la política registrada en OPS #206. La cobertura dinámica aplicable se ejecuta sobre la aplicación local con transporte HTTP real y proveedor loopback controlado.

## Casos de seguridad cubiertos

| Riesgo/caso | Control y resultado esperado |
|---|---|
| Sesión ausente o token alterado | `401`; no consulta prompt ni proveedor |
| Pedido de otro titular | `403 ORDER_FORBIDDEN`; no envía CSAT |
| Pedido no entregado | `422 ORDER_NOT_DELIVERED`; no actualiza prompt |
| Prompt ausente, `ELIGIBLE` o `DISMISSED` | `409 PROMPT_NOT_ELIGIBLE`; no inventa transición |
| Replay local `SUBMITTED` | `409 CSAT_ALREADY_SUBMITTED`; no reenvía |
| Duplicado canónico de G5 | Reconcilia el prompt a `SUBMITTED`; no crea otra calificación |
| Conflicto externo desconocido | `503`; conserva `SHOWN` |
| Timeout o resultado incierto | Una sola mutación, sin retry; conserva `SHOWN` |
| Campos `clienteId`, query o datos adicionales | `400`; titular y canal son del servidor |
| Motivos duplicados, nulos o fuera de formato | `400` antes de persistencia/proveedor |
| Comentario con controles o más de 1000 caracteres | `400` |
| Texto con apariencia HTML/XSS | Se transporta como texto JSON, no se refleja en la respuesta y no se guarda localmente |
| PII/rating local | `PostDeliveryPrompt` sólo recibe estado y timestamps; G1 no persiste puntuación, motivos ni comentario |

## Ejecución y evidencia

Suites dirigidas:

- `test/csat.e2e-spec.ts`: contrato HTTP, ownership, entrega, replay, validación, timeout, errores y XSS como texto inerte.
- `test/csat.integration-spec.ts`: unicidad, rollback, concurrencia, resultado incierto y reconciliación sobre PostgreSQL 16 temporal.
- `src/config/environment.spec.ts`: flags estrictos y prohibición de combinar CSAT real con identidad sandbox.

Los checks del PR ejecutan Node 22/24, build/test, sesión y verificación PostgreSQL aislada. SCA runtime registra cero vulnerabilidades; Gitleaks no encontró secretos en fuente ni historial en el corte QA compartido. Los hallazgos de tooling y su aceptación se conservan en OPS #206 y requieren confirmación del revisor para el HEAD final.

## DAST aplicable

El flujo E2E local levanta un proveedor HTTP loopback y envía solicitudes reales al controlador del BFF. Se prueban entradas inválidas, autenticación, autorización, replay, timeout, respuestas malformadas y sanitización de errores sin tocar cuentas ni datos externos. Esto es DAST dirigido en entorno controlado, no un baseline exhaustivo de una URL desplegada.

DAST autenticado sobre un deployment sólo debe repetirse cuando exista staging aislado, cuentas autorizadas, pedido propio entregado y SHA/ID identificable. No se deben publicar tokens, cookies, comentarios con PII ni trazas sin sanitizar.

## Hallazgos y riesgo residual

1. El comentario puede contener texto con sintaxis HTML porque G1 no lo renderiza; el consumidor debe mostrarlo siempre como texto escapado. El caso de regresión comprueba que G1 no lo refleja ni persiste localmente.
2. I-03/I-04 están implementados contra contratos y dobles, pero carecen de prueba REAL autorizada.
3. G-PROMPT no define productor ni API de `ELIGIBLE/SHOWN/DISMISSED`; los tests parten de un fixture `SHOWN` y no acreditan ese ciclo.
4. No hay SHA de despliegue atribuible al PR ni revisión independiente.

## Pendientes para cierre integral

- Homologar proveedor/versiones, auth, datos y trazas de I-03/I-04, y ejecutar positivo, pedido ajeno, no entregado, duplicado y timeout REAL.
- Aprobar G-PROMPT y su productor antes de habilitar los flags.
- Ejecutar DAST autenticado únicamente en staging autorizado e identificado.
- Obtener aprobación independiente y completar el control OWASP/release posterior de #225.

El trabajo QA propio queda preparado para revisión; estos gates impiden declarar F-040 desplegada o cerrada, pero no revisar el incremento local.
