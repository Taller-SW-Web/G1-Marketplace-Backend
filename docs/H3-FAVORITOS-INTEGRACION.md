# Entrega backend de favoritos al frontend — v0.2.0

Rama: `feat/s1-f036-f038-favoritos`, PR #15. Contrato:
[handoff vigente](FAVORITOS-FRONTEND-HANDOFF.md),
[OpenAPI](contratos/openapi-h3.json). Identidad/catalogo/comercio de demo MOCK;
HTTP, transacciones y PostgreSQL reales locales. Revisión humana y gates externos pendientes.

## Preparación aislada

En una terminal del backend con Node 24 y Docker Desktop, sin DATABASE_URL apuntando
a la base de pruebas:

```powershell
npm ci --no-audit --no-fund
npm run build
docker compose -f docker-compose.test.yml up -d --wait
$env:TEST_DATABASE_URL='postgresql://h3_test:h3_local_test_only@127.0.0.1:55432/marketplace_h3_test?schema=public'
npm run test:integration
npm run sandbox:fixtures
npm run test:smoke
```

No hay migración nueva en esta entrega. El runner aplica únicamente las migraciones
versionadas del backend. Nunca usar migrate reset ni la base de desarrollo para probar.
La preparación de fixtures es idempotente, no borra filas y no cambia fechas existentes.

Fixtures A/B: PRD-1 → SKU-SIMPLE, precio 89.90 PEN versión 1 y capacidad sandbox 10;
PRD-VARIANT → requiere selección; PRD-OUT-OF-STOCK → agotado; PRD-RETIRED → retirado;
PRD-COMMERCE-UNAVAILABLE → cotización fallida. `sandbox:fixtures -- --outage` añade
PRD-UNAVAILABLE para probar fallo global de lectura 503. Esa fila hace fallar el GET
del titular hasta quitarla por DELETE; no simular vacío. Eliminarla después de la prueba.
Los límites y precios son fixtures, no inventario ni precios homologados de Productos.

Para arrancar el backend, seguir la terminal de demo de [guía](H3-DIEGO-USO.md):
NODE_ENV=development, H3_SANDBOX_ENABLED=true, secreto aleatorio de al menos 32 bytes,
DATABASE_URL temporal, PORT=10000. Emitir tokens A/B con `sandbox:token` sin publicarlos.
Para usar `sandbox:fixtures` después de cambiar DATABASE_URL a la base temporal,
usar una terminal de preparación separada: la protección exige distinguir desarrollo y pruebas.

## Verificación HTTP

Con `$base` y `$headersA` de la guía:

```powershell
Invoke-RestMethod "$base/api/v1/wishlist" -Headers $headersA
Invoke-RestMethod "$base/api/v1/wishlist/items/PRD-1/add-to-cart" -Method Post -Headers $headersA
Invoke-RestMethod "$base/api/v1/wishlist" -Headers $headersA
```

La tarjeta PRD-1 permanece; otra adición explícita aumenta la cantidad, validada
contra el total comercial sandbox. No hay Idempotency-Key, historial ni replay
durable. Ante respuesta incierta consultar GET `/api/v1/carts/current` con el mismo
token; no volver a enviar automáticamente la adición.

## Configuración y aceptación frontend

MARKETPLACE_API_URL=http://127.0.0.1:10000, sandbox frontend explícito y tokens A/B
solo en servidor. Configurar origen/cookies según el BFF existente. Empezar con flags
de lectura y adición false y mantener MOVE false. Adaptar primero endpoint, botón y
controlador conforme al handoff: conservar tarjeta y quitar replay/clave durable.

El responsable frontend debe ampliar su runner y E2E conectado (actualmente solo
guardar/quitar). Probar GET/DTO, A/B, 503, agregar sin retirar tarjeta, segunda adición,
agotado, variante y sesión vencida, sin interceptar HTTP, verificando filas PostgreSQL.
Activar lectura y después adición solo en sandbox y con esos resultados registrados.
No se modifican ni se certifican pruebas frontend desde este PR backend.

## Auditoría de salud: solicitud preparada para el equipo

Estado: **sin confirmar**. Diego coordina la consulta; no se envió un mensaje externo.

«¿Algún monitor, dashboard o servicio consume database.carts o database.wishlistItems
de /, /health o /ready? Indicar sistema y responsable, o confirmar que no existen
consumidores. La comprobación de conexión continúa mediante database.connected y
HTTP 200/503; /live sigue disponible para liveness.»

Registrar fecha, responsable y sistemas revisados. Sin consumidores, cerrar sin código
adicional. Con consumidores, acordar su migración y obtener aceptación antes de cerrar.
No declarar compatibilidad externa ni cierre integral F-036–F-039 por esta entrega.
