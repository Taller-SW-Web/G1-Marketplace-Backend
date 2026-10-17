# Evidencia de ampliación del PR #15 — lectura y agregar al carrito

Fecha local de ejecución: 16/10/2026. Rama: `feat/s1-f036-f038-favoritos`;
destino `develop`, PR #15. Base anterior: `aacb454`, con evidencia del build de
`de049b1`. Entorno local: Windows/PowerShell, Node 24.16.0, npm 11.13.0,
Prisma Client 5.22.0 y PostgreSQL 16 temporal de docker-compose.test.yml.
Código funcional validado: `e0147eb`. Las entradas de compilación de src, esquema,
package/lockfile y tsconfig coinciden por SHA-256 con la copia limpia que pasó el build.

## Comportamiento verificado

- GET devuelve arreglo privado del titular, por createdAt DESC con desempate estable,
  diferenciando vacío, retirados, agotados y errores de catálogo.
- POST add-to-cart agrega una unidad por solicitud aceptada, resuelve SKU sandbox
  explícito y conserva el favorito y su fecha. Comparte servicio/transacción y
  coordinación por titular con las adiciones normales del carrito.
- Identidad compartida: RS256/JWKS existente y HS256 sandbox restringido a development/test.
  Tokens inválidos no se convierten en sesión anónima. Catálogo/comercio fallan cerrados.
- No existe wishlist_moves ni hay migración nueva. No hay replay durable: repetir una
  petición puede agregar otra unidad. Se cambió la propuesta inicial por instrucción
  explícita del usuario: agregar al carrito y conservar el favorito.
- POST/DELETE anteriores y campos de salud preservados. OpenAPI v0.2.0 mantiene
  ejemplos INVALID_REQUEST/INVALID_PRODUCT_ID y documenta lectura y adición.

## Comandos y resultados de este corte

| Comando | Resultado observado |
|---|---|
| `npm run typecheck` | Código 0, incluidos los archivos nuevos de pruebas. |
| `npm test` | Código 0: 32 unitarias, 56 HTTP, 4 del servidor mock. |
| `npm run test:integration` | Código 0: 21 pruebas en 2 suites con PostgreSQL 16. Una migración histórica, sin pendientes. |
| `npm run build` en proyecto | Código 0: Prisma generado y TypeScript compilado. |
| `npm ci --offline --no-audit --no-fund` en copia limpia | Código 0; 606 paquetes, 1 minuto; aviso de deprecación de glob. |
| `npm run build` en copia limpia, fuera del sandbox | Código 0; Prisma Client 5.22.0 generado en 102 ms y compilación TypeScript completa. |
| `npm run test:smoke` | Código 0 sobre dist/main.js; salud 200, flujo anterior y listado/adición con favorito conservado. |
| `npm run docs:openapi` | Código 0; JSON regenerado desde el generador versionado. |
| `npm run sandbox:fixtures` | Código 0; preparación A/B en marketplace_h3_test sin borrar filas ni emitir tokens. |
| Inspección de OpenAPI | JSON válido; referencias internas resueltas, versión 0.2.0, add-to-cart presente y move-to-cart ausente. |
| `git diff --check` | Código 0; avisos locales LF/CRLF, sin errores de espacios. |

La copia `.audit/pr15-add-clean` se creó copiando solo archivos versionados y nuevos
no ignorados; sin .git, .env, node_modules ni dist previos. Sus entradas de build
son las de esta ampliación. La instalación nueva no reutilizó el cliente generado
del proyecto. El primer build restringido no pudo acceder al checksum de
binaries.prisma.sh; la repetición autorizada fuera del sandbox pasó. SWC tampoco
cargó dentro del sandbox: npm test se repitió fuera de él y aprobó.

Las 25 unitarias/53 HTTP/4 mock/5 PostgreSQL anteriores son cortes históricos,
distintos del 32/56/4/21 actual. El aviso de readiness y el error sanitizado de las
pruebas negativas son esperados. La prueba de rollback provoca un fallo después
de escribir carrito y comprueba que no queda ninguna mutación parcial.

## Integración PostgreSQL y cambio solicitado

Las pruebas nuevas verifican persistencia tras reiniciar, propietario A/B, fecha del
favorito intacta, adiciones concurrentes sin pérdida de incrementos, coordinación
con adición normal, variante, retirado, agotado, catálogo/cotización caídos,
validación de cantidad total, rollback, rechazo de cuerpos/clave no admitidos,
favorito ausente/ajeno y ausencia de tabla/ruta de movimientos. Las suites previas
conservan las verificaciones de salud y unicidad concurrente de favoritos.

El prototipo de idempotencia durable alcanzó a aplicar una migración exclusivamente
a marketplace_h3_test. Tras la aclaración del usuario se retiraron su modelo, código
y archivo, y se revirtió solo esa tabla y su entrada de migración en la base temporal
identificada. La integración final comprobó una sola migración histórica y ausencia
de public.wishlist_moves. No se alteró la base de desarrollo ni se usó migrate reset.

## CI, entrega y pendientes

Se agrega `.github/workflows/backend-ci.yml` para ejecutar instalación/build limpios,
typecheck, suites, PostgreSQL 16, smoke y comprobación del OpenAPI generado en GitHub.
Este registro acredita las ejecuciones locales descritas; el resultado remoto del
commit publicado debe consultarse en los checks del PR, no inferirse de este archivo.

Contrato y cambios necesarios del BFF: [handoff](../../FAVORITOS-FRONTEND-HANDOFF.md).
Comandos y fixtures: [entrega](../../H3-FAVORITOS-INTEGRACION.md).
No se modificó el frontend ni se ejecutó su E2E ampliado. Mantener MOVE desactivado;
adaptar transporte/controlador para add-to-cart y conservar tarjeta antes de habilitarlo.

Compatibilidad de salud externa: **pendiente** de respuesta del equipo sobre
database.carts/database.wishlistItems. Solicitud preparada en la entrega; no se
envió un mensaje externo ni se atribuye una confirmación no recibida.

Identidad de demo, catálogo y comercio son MOCK; HTTP/Prisma/PostgreSQL reales locales.
No se certifican integraciones externas, G-AUTH/I-01/G-SKU/G-QUANTITY/G-UNDO, F-039
original, UI integral ni producción. Revisión humana y aprobación del PR pendientes.
