# H5 — índice de evidencia

Paquete de exposición organizado por los cinco puntos prioritarios. Cada documento distingue evidencia **REAL**, **MOCK/LOCAL** y **LAB LOCAL**; esas etiquetas conservan el alcance de la corrida fuente.

## Entregables prioritarios

| Prioridad | Issue | Índice / documento | Fuentes y estado |
|---|---|---|---|
| 1 | BE #324 | [Informe consolidado y tabla de fuentes](informe-pruebas-h5.md) | [Compra PED-2026-00092](informe-pruebas-h5.md#1-324-paquete-de-evidencia-h5), ronda BFF, G7/RabbitMQ, webhook, correo, Playwright, k6, cobertura, SAST/DAST; varios registros primarios y artefactos aún pendientes de enlazar |
| 2 | BE #299 | [Trazabilidad F → prueba → run](299-trazabilidad.md) | [Matriz F-001..F-040 y access logs en PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/354); [correlationId del consumidor en PR #390](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/390); falta `correlationId` REAL E2E y runs atribuibles a cada F |
| 3 | BE #325 | [Arquitectura C4](325-arquitectura-c4.md) | Vistas de contexto, contenedores y componentes con APIM, RabbitMQ y webhook de Ventas; revisión de Arquitectura e IDs de despliegue pendientes |
| 4 | BE #321 | [Contratos de eventos y diagramas](321-contrato-eventos.md) | [Acuerdo G7/RabbitMQ SPECS #22](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/22) y [Ventas/webhook SPECS #20](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/20); evidencia REAL enlazada con sus límites |
| 5 | BE #293 | [Contract tests de Productos y Ofertas](293-contract-tests-productos.md) | [PR #354](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/354) y [PR #358](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/358), CI reportado verde; falta integrar al branch de entrega y verificar la suite allí |

## Entregables relacionados

- [BE #392 — informe go/no-go](392-go-no-go.md) y [selección de 15 casos trazables](392-casos-15.md). La recomendación requiere validación del PO.
- [BE #291, BE #292 y FE #137 — matriz y cobertura](291-292-137-cobertura.md).
- [BE #295 — contract tests de Ventas](295-contract-tests-ventas.md); este contrato no sustituye los de G6 requeridos por #293.
- [Lighthouse móvil — corte H5](performance-2026-11-26.md).

## Bloqueos registrados

Falta el `correlation-id` REAL visible de extremo a extremo, la cuenta B con 403, CSAT, `DESPACHADO`/`ENTREGADO` del pedido `PED-2026-00092`, la revisión de Arquitectura y la decisión del PO para go/no-go. Las pruebas locales, snapshots y laboratorios se conservan como tales y no se presentan como integración REAL.
