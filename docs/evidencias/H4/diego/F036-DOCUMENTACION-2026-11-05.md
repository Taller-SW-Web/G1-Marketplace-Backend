# F-036 Agregar producto a favoritos — trazabilidad documental

Fecha de actualización: 05/11/2026. Responsable: Diego Espinoza. Revisor pendiente: Fernando Saire (`saire22`). Issue documental: [#179](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/179).

## Estado del corte

La implementación y las pruebas locales de F-036 están preparadas para revisión en [Backend PR #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239), actualmente abierto y **Ready for review**. El HEAD observado antes de este incremento documental fue `6e028fb4b03bc2c39a04426a473f12b9dccd5011`; el SHA definitivo del incremento se registra en la issue y en el PR después de publicarlo.

Este documento no declara terminada la función: G6 real, el despliegue G1 y la aprobación independiente continúan pendientes.

## Fuentes vigentes

| Capa | Referencia |
|---|---|
| Funcional | [F-036 Agregar producto a favoritos](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/funcional/F-036-agregar-favorito.md) |
| Contrato API | [POST `/api/v1/wishlist/items`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/contrato-api/F-036-agregar-favorito.md) |
| UI | [F-036 Agregar favorito](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/ui/F-036-agregar-favorito.md) |
| Vista de favoritos | [V-009](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/ui/vistas/V-009-favoritos.md) |
| Implementación backend | [`src/wishlist`](../../../../src/wishlist) y [`prisma/schema.prisma`](../../../../prisma/schema.prisma) |
| Pruebas | [`test/wishlist.e2e-spec.ts`](../../../../test/wishlist.e2e-spec.ts), [`test/wishlist.integration-spec.ts`](../../../../test/wishlist.integration-spec.ts) y [`test/auth-g7.e2e-spec.ts`](../../../../test/auth-g7.e2e-spec.ts) |
| Integración solicitada a G6 | [G6 docs #115](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/issues/115) |

## Diseño y decisiones

- Archivo Figma: [Mockups](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=1-4).
- V-009 y estados de favoritos: [206:3140](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=206-3140), [206:3224](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=206-3224), [206:3299](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=206-3299) y [206:3362](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=206-3362).
- F-036 guarda `productId`, no SKU ni variante. El titular se deriva de la sesión; el cliente no puede enviar `customerId`.
- La operación es idempotente por `(customerId, productId)`: `201` al crear y `200` si ya existía, sin duplicar ni modificar `createdAt`.
- El token técnico de G6 identifica a Marketplace, nunca al comprador. G1 no envía `customerId` a G6.
- La spec funcional prevalece ante divergencias visuales. La existencia de los frames no acredita aprobación visual ni integración real.

## Operación y errores

| Situación | Resultado público de G1 | Persistencia |
|---|---|---|
| Producto elegible, primera alta | `201` | Crea una fila del titular |
| Producto ya guardado | `200` | Conserva una sola fila y su fecha |
| Sesión ausente, expirada o revocada | `401` | No escribe |
| Propietario enviado por body/query | `400` | No escribe |
| Origen/CSRF inválido | `403` | No escribe |
| Producto inexistente o no elegible | `404 PRODUCT_NOT_AVAILABLE` | No escribe |
| G6 indisponible, timeout o respuesta incierta | `503 CATALOG_UNAVAILABLE` | Falla cerrado y no escribe |

El frontend no debe reintentar automáticamente una mutación cuyo resultado sea incierto ni presentar éxito antes de recibir `201/200`.

## Evidencia disponible

- Alta `201`, repetición `200`, aislamiento A/B, fecha estable y ausencia de duplicados.
- PostgreSQL 16 temporal: unicidad, concurrencia, rollback y persistencia tras reinicio.
- Sesión compartida G7: MFA, expiración, logout, refresh, introspección y rechazo de propietario forjado.
- CI del HEAD observado: build, compilación, pruebas backend, verificación aislada y sesión G7 aprobados.
- Evidencia detallada: [conexión G7](G7-FAVORITOS-2026-11-03.md), [reporte por issue](../../../QA-DIEGO-CIERRE-2026-11-03.md#issue-179) y [evidencia local](EVIDENCIA.md).

Las pruebas de G6 usan proveedor controlado o loopback; no se presentan como integración externa real.

## Pendientes para cerrar #179

1. Completar [#177](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/177) con G6 real: URL y SHAs efectivos, grant técnico, producto autorizado, positivo, `404`, fallo/timeout y `X-Correlation-Id`, sin secretos.
2. Registrar URL y SHA del despliegue G1 y ejecutar el recorrido UI/API autorizado.
3. Incorporar los resultados finales de QA funcional [Frontend #88](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/88) y QA seguridad [Backend #178](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/178).
4. Obtener revisión independiente de Fernando Saire; si participa en el artefacto, solicitar una segunda revisión para esa parte.
5. Sustituir en esta sección los pendientes por enlaces a la evidencia real y registrar hallazgo/retest, si corresponde.
