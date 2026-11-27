# BE #295 — Contract tests de Ventas (evidencia relacionada)

Esta evidencia corresponde a **Ventas**, no a BE #293 (Productos y Ofertas). Se registra como apoyo para el paquete H5 y no como cierre de #293 ni de #295.

| Campo | Evidencia comunicada |
|---|---|
| PR | [#344](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/344), fusionada en `develop` |
| Commit de merge | `dc66208` |
| CI | Pasó; permalink del run/check: Pendiente |
| Versiones | M1 Ventas `1.10.0`; M2 Postventa `1.6.0` |
| Contract tests | Snapshots OpenAPI offline: 6/6 aprobados |
| Provider tests | Servidor local, datos y token sintéticos; no realizan llamadas a Ventas REAL |

## Ampliación offline sobre `develop` (`23638be`)

Se conservan los snapshots de #344 sin cambios. #401 (`be6ac8b`) documenta los contratos del BFF; #402 (`ea29475`) cubre la regresión PostgreSQL de checkout, y #409 (`769e3b7`) ajusta timestamps de eventos G7. No se modifican esos contratos, la persistencia ni los adaptadores de producción.

| Caso | Evidencia local | Límite |
|---|---|---|
| M1 `POST /api/v1/pedidos` | El doble loopback guarda la primera solicitud pero no responde: el adaptador emite `504 SALES_TIMEOUT` sin reintento automático. Una repetición explícita con la misma clave y cuerpo byte a byte recibe el `200` sintético y devuelve el pedido esperado. Se verifican el bearer de servicio, los errores M1 `400/401/403` y el rechazo local de una clave que no es UUID v4. | El doble no demuestra deduplicación en G5 ni que Checkout reconstruya un cuerpo idéntico si cambia la dirección. Consulta por clave: **NOT_IMPLEMENTED**; M1 no publica esa ruta. |
| M1 `/me` y detalle | Se conserva la cobertura existente de pedidos. Se verifica el bearer de cliente y la ruta exacta de detalle en los dobles; el prechequeo de CSAT no hace el POST si el titular no coincide. | No se verifican JWT reales ni autorización en G5. |
| M2 `POST /api/v2/csat` | La prueba E2E local verifica las rutas M1/M2, el mismo bearer de cliente en ambas, el cuerpo exacto con cliente derivado de la identidad, `201` sin cuerpo, `401/403` sanitizados y los errores del sobre M2 1.6.0 `{codigo, mensaje, timestamp}`. Se corrigió el adaptador para reconocer `codigo`: el `409 CSAT_ALREADY_SUBMITTED` reconcilia el prompt y el `422 ORDER_NOT_DELIVERED` lo conserva sin modificación. No usa DB ni servicios remotos. | La compatibilidad está probada con un doble loopback, no con G5 desplegado. El estado real del prompt y la aceptación del proveedor siguen sujetos a la homologación intermodular. |

### Validación local

- `npm run test:g5:sales-adapter:offline`: 13 aprobados; `npm run test:pinned-spec:offline`: 7 aprobados.
- `npm run test:e2e -- --runTestsByPath test/csat.e2e-spec.ts test/orders.e2e-spec.ts test/openapi-contract.e2e-spec.ts`: 3 suites, **53 aprobados, 0 omitidos** tras corregir el mapeo M2. La suite CSAT aislada: 25/25.
- `npm run test:unit`: 67 suites, 788 tests aprobados. `npm run build` (motores de Prisma locales), `npm run typecheck` y `npm run docs:validate`: aprobados (5 contratos válidos).

### Pendientes REAL

El [registro REAL separado](integracion-real/README.md) ya informa el camino positivo F-026/F-027, lecturas A/B del pedido y una repetición BFF que devuelve el mismo pedido. Esa repetición no demuestra un replay directo en M1 tras perder la respuesta, ni conflicto por cuerpo distinto, ni la homologación de la matriz de errores y timeouts. Esos casos y la aceptación REAL de CSAT siguen pendientes de una ventana aprobada y evidencia atribuible; el mapeo contractual M2 quedó corregido y cubierto sólo con un doble loopback. No se hicieron llamadas remotas ni se usaron credenciales reales en esta ampliación. Revisor recomendado: Diego Espinoza.
