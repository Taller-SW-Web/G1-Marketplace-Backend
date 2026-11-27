# H5 — índice de evidencia

Paquete canónico de exposición en `develop`, actualizado después del merge de [BE #408](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/408) (merge `7aa625c9ba0cd51d1704a5f0043d16473e790033`, head `064385d77b26698000161f0ba36cac6e8e8a2db2`). Cada documento distingue evidencia **REAL**, **MOCK/LOCAL** y **LAB LOCAL**; esas etiquetas conservan el alcance de la corrida fuente.

## Entregables prioritarios

| Prioridad | Issue | Índice / documento | Fuentes y estado |
|---|---|---|---|
| 1 | BE #324 | [Informe consolidado y tabla de fuentes](informe-pruebas-h5.md) | [Compra PED-2026-00092](informe-pruebas-h5.md#1-324-paquete-de-evidencia-h5), BFF, G7/RabbitMQ, webhook, correo, Playwright, k6, cobertura, SAST/DAST; fuentes primarias y límites detallados en el informe |
| 2 | BE #299 | [Trazabilidad F → prueba → run](299-trazabilidad.md) | [PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/354) sigue abierta/conflictiva; [PR #390](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/390) ya está fusionada en `develop` (merge `f50938b`); falta `correlationId` REAL E2E y runs atribuibles a cada F |
| 3 | BE #325 | [Arquitectura C4](325-arquitectura-c4.md) | Vistas con IDs de APIM, ruta, servicios Render, exchange/queue/DLX y webhook; revisión de Arquitectura pendiente |
| 4 | BE #321 | [Contratos de eventos y diagramas](321-contrato-eventos.md) | [Acuerdo G7/RabbitMQ SPECS #22](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/22) y [Ventas/webhook SPECS #20](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/20); enlaces directos a evidencia REAL, con sus límites |
| 5 | BE #293 | [Contract tests de Productos y Ofertas](293-contract-tests-productos.md) | #354/#358 están abiertas y conflictivas contra `main`; snapshot G6 `0.7.0-rc.3` no está en `develop`, cuyo pin sigue en `0.6.0-rc.1` |

## Entregables relacionados

- [BE #392 — informe go/no-go](392-go-no-go.md) y [selección de 15 casos trazables](392-casos-15.md). La recomendación requiere validación del PO.
- [BE #291, BE #292 y FE #137 — matriz y cobertura](291-292-137-cobertura.md).
- [BE #295 — contract tests de Ventas](295-contract-tests-ventas.md); este contrato no sustituye los de G6 requeridos por #293.
- [Lighthouse móvil — corte H5](performance-2026-11-26.md).
- [Resultado de seguridad y cobertura](informe-pruebas-h5.md#5-cobertura-y-métricas): SHA del merge, runs y artefactos SAST/DAST, cobertura BE/FE.

## Bloqueos registrados

Falta el `correlation-id` REAL visible de extremo a extremo, la cuenta B con 403, CSAT, `DESPACHADO`/`ENTREGADO` del pedido `PED-2026-00092`, la revisión de Arquitectura, la decisión del PO para go/no-go y la URL exacta del informe LAB LOCAL. #354/#358 siguen conflictivas. #390 ya se fusionó; #317 reporta una traza de correlación en LAB LOCAL, pero no adjunta el ID/log y no sustituye la entrega REAL. FE #138 dice que conserva HTML/trazas localmente, pero no están subidos ni enlazados; el HTML hallado en el checkout corresponde a accesibilidad/V-007, no a esa corrida.
