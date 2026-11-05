# F-006: selección de destacados, históricos y arranque sin ventas

## Regla confirmada por Giuliano a partir del mensaje de Jim — 03/11/2026

**Prioridad:** destacados definidos → históricos más vendidos → aleatorios sólo cuando todavía no hay historial. Esto sustituye la selección exclusivamente editorial propuesta en el corte anterior. La confirmación de la prioridad y de la métrica no certifica revisión de código, contrato aceptado por el proveedor ni despliegue.

Giuliano eligió documentar como criterio de históricos las **unidades vendidas del canal MARKETPLACE, en todo el historial, con pago confirmado, descontando devoluciones confirmadas**. Se agrupan por producto, no por variante/SKU. La fuente autorizada y su contrato siguen pendientes de homologación; no se calculó un ranking con datos de compradores o importes administrativos.

La alternativa se evalúa al quedar vacía la selección anterior. Una selección definida parcialmente elegible se conserva sin rellenarla con otras fuentes. Si hay historial pero ninguno de sus productos es publicable, la sección puede quedar vacía: no se afirma que no haya historial. Un fallo o ausencia de la fuente de ventas es indisponibilidad técnica y no habilita aleatorios.

## Configuración y estado real

| Variable | Predeterminado | Efecto |
| --- | --- | --- |
| `CATALOG_FEATURED_ENABLED` | `false` | Habilita la composición de destacados |
| `CATALOG_FEATURED_APPROVED` | `false` | Requisito adicional de activación REAL; no demuestra revisión o grants |
| `CATALOG_FEATURED_IDS` | Vacío | Hasta ocho IDs definidos, en su orden editorial |
| `CATALOG_HOME_FALLBACK_ENABLED` | `false` | Activa la secuencia automática después de destacados vacíos |
| `CATALOG_MOCK_SALES_IDS` | Vacío | Sólo MOCK: ranking sintético; vacío modela explícitamente arranque sin historial |

**El módulo no tiene conectado un proveedor real de ranking.** `CATALOG_HOME_SOURCES` expone el puerto `salesRanking(signal, requestId)` para integrar ese adaptador cuando exista un contrato autorizado. Su implementación predeterminada está ausente. Activar fallback REAL sin ella produce `503 CATALOG_UNAVAILABLE`, diagnóstico interno `SALES_RANKING_NOT_CONFIGURED`, si no hay destacados definidos elegibles. La bandera no fabrica datos ni conecta por sí sola Ventas.

El puerto retorna `{ hasHistory, orderedProductIds }`: hasta cien IDs únicos en orden de ventas; se resuelven las primeras ocho posiciones. `hasHistory: false` sólo puede acompañar una lista vacía y significa ausencia comprobada de historial, no un timeout, error de permisos o lista incompleta. `hasHistory: true` admite lista vacía cuando existe historial sin candidatos. La cuenta de unidades y los datos de pedidos no forman parte del DTO público. Reemplazar el proveedor del módulo por una factory del adaptador autorizado será trabajo de integración pendiente.

## Lectura de Productos y muestreo

Cada ID definido o del ranking se revalida mediante `GET /api/v1/productos/{productoId}?canal=MARKETPLACE`, operación ya publicada en el [OpenAPI rc1 fijado](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b/contratos/http/openapi.yaml), blob Git `f64bfe9a097b2a0f74c2600988305443d92f640e`. No se agregó una operación externa ni se modificó el pin.

El arranque sin historial consulta el listado con `NOMBRE_ASC`, obtiene el total y sortea hasta ocho posiciones distintas con `crypto.randomInt`, sin reemplazo. Lee únicamente las páginas de tamaño 24 necesarias, reutiliza la primera y conserva el orden del sorteo. No se limita a mezclar la página inicial. Máximo nueve lecturas de páginas, tres simultáneas. Las lecturas por ID también se limitan a tres simultáneas. Todo comparte el deadline de Home, incluidas categorías y ranking: no se multiplica el presupuesto por tarjeta.

La muestra se renueva en cada nueva lectura de Home completada, sin persistencia o caché comercial. Header y Home comparten únicamente solicitudes simultáneas en el frontend. Esta frecuencia es el comportamiento técnico preparado para revisión.

El sorteo es uniforme sobre posiciones del catálogo declarado por G6 si el listado ordenado permanece estable durante las lecturas. No existe una transacción/snapshot global entre llamadas HTTP: se rechazan cambios de total y duplicados observados, pero un cambio de orden no observable con igual total sigue siendo una limitación. No se certifica una muestra de un snapshot productivo. Un resultado vacío real del catálogo se conserva vacío.

## Errores y proyección

- Se verifica que cada lectura por ID corresponda al producto pedido. Un 404 `PRODUCTO_NO_ENCONTRADO`, un estado conocido no publicable o un slug no publicable permiten omitir esa tarjeta.
- Un 401/403/429/503, un 404 de otro significado o datos malformados son error técnico. No se reemplazan por productos MOCK ni por aleatorios.
- Nombre, slug, categoría, marca e imágenes provienen de G6. Sólo se publican `productId`, `slug`, `name`, `categoryId`, `brandId`, `image`.
- Imágenes ausentes o `[]` producen `image: null`. Una URL insegura/presente fuera de allowlist mantiene error.
- La identidad es la del servidor; no se reenvía el token del visitante. Ranking, historial, credenciales y campos administrativos no aparecen en Home.
- Los límites ocho/cien/tres son límites técnicos de la implementación para revisión; Jim no fijó con su mensaje una cantidad comercial ni un SLA adicional.

## Demo y comprobación

Desde Frontend, con Backend como directorio hermano y builds del código actual:

```powershell
npm run demo:catalogo:h4 -- --featured --check --skip-build
npm run demo:catalogo:h4 -- --best-sellers --check --skip-build
npm run demo:catalogo:h4 -- --cold-start --check --skip-build
```

Los escenarios son excluyentes, etiquetados MOCK, sin escrituras en BD ni ventas reales. Omitir `--check` conserva la demo para revisión; Ctrl+C detiene sus procesos. `--integration-budget` conserva el perfil autorizado de 15 s G6/18 s Next, con objetivo G6 de 5 s. Los defaults no cambian.

Las pruebas unitarias cubren prioridad, ausencia frente a fallo, validación del ranking, cancelación, flags, muestras fuera de la primera página y concurrencia. El ensayo HTTP usa un doble local de G6 y un ranking sintético; el camino de adaptador REAL no acredita una integración externa REAL.

## Pendiente

Contrato y adaptador autorizado de históricos con la métrica elegida, semántica de historial vacío, mapping SKU/producto y estados/devoluciones; grants; revisión independiente; activación acordada y prueba del SHA desplegado. No libera G-FEATURED ni I-01 por la existencia de una demo.
