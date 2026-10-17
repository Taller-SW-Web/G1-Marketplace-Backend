# Backend H3 de Diego — ejecución y handoff

**Restricción vigente (17/10/2026): no ejecutar operaciones sobre bases de datos.**
Las secciones de PostgreSQL/demo siguientes registran procedimientos históricos;
no ejecutarlos bajo la restricción actual. El runner de integración no aplica
migraciones y los scripts con escrituras están bloqueados por defecto.
El CI automático valida únicamente con dobles de prueba, sin servicio de base de datos.
Detalles: [resolución del PR](evidencias/h3/resolucion-conflictos-pr15.md).

Este corte amplía F-036/F-038 con lectura F-037 y adición al carrito conservando el
favorito, sin tabla de movimientos. La identidad de demo, catálogo y condiciones
comerciales son **MOCK**; NestJS, Prisma y PostgreSQL son **reales locales**.
No hay integración homologada con Seguridad/Productos ni aceptación UI de los nuevos
flujos. Ver [contrato y conexión vigentes](H3-FAVORITOS-INTEGRACION.md).

## Requisitos

Node `>=22 <25` (verificado con 24.16.0), npm y Docker Desktop con contenedores Linux. Comenzar en la raíz del backend. No utilizar bases compartidas para las pruebas.

```powershell
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

`lint` conserva la comprobación TypeScript de la base compartida; no equivale a un análisis ESLint/SAST. `npm test` ejecuta unitarias y HTTP con repositorio simulado; la persistencia se verifica por separado.

## PostgreSQL aislado y pruebas reales

El compose de pruebas usa PostgreSQL 16, memoria temporal, puerto 55432 y una base exclusiva. No ejecuta `database/db.sql`: las migraciones las aplica el runner, evitando crear las mismas tablas dos veces.

```powershell
docker compose -f docker-compose.test.yml up -d --wait
$env:TEST_DATABASE_URL='postgresql://h3_test:h3_local_test_only@127.0.0.1:55432/marketplace_h3_test?schema=public'
npm run test:integration
npm run test:smoke
```

El runner carga `.env` si existe, valida que la base sea local `marketplace_h3_test`, esquema public y distinta de desarrollo; después aplica `prisma migrate deploy` y ejecuta las pruebas. Las suites limpian favoritos, líneas y carritos de los UUID ficticios A/B de esa base temporal. No usa `migrate reset`, ni borra volúmenes o tablas de desarrollo.

Si `DATABASE_URL` ya apunta a esa misma base temporal, retirarla de la sesión o usar una terminal nueva antes de ejecutar integración. No desactivar la validación para saltar el control.

```powershell
# Detiene únicamente el servicio temporal de este archivo.
# Su contenido es efímero: no usarlo para guardar datos de trabajo.
docker compose -f docker-compose.test.yml down
```

## Demo manual contra la base temporal

Después de las pruebas, se puede usar el mismo contenedor temporal para demostrar el backend en una terminal exclusiva. Mantenerlo levantado. Estas variables solo afectan a la terminal actual y no se versionan:

```powershell
$env:DATABASE_URL='postgresql://h3_test:h3_local_test_only@127.0.0.1:55432/marketplace_h3_test?schema=public'
$env:NODE_ENV='development'
$env:H3_SANDBOX_ENABLED='true'
$env:H3_JWT_SECRET=[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:CORS_ALLOWED_ORIGINS='http://localhost:3000'
$env:PORT='10000'

# Guardar en variables para evitar publicar los tokens en consola/evidencia.
$tokenA = (npm run --silent sandbox:token -- --customer A).Trim()
$tokenB = (npm run --silent sandbox:token -- --customer B).Trim()
$headersA = @{ Authorization = "Bearer $tokenA" }
$headersB = @{ Authorization = "Bearer $tokenB" }

# Arranca el artefacto compilado en segundo plano, heredando solo esta sesión.
$backend = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'dist/main.js' -PassThru -WindowStyle Hidden
```

Esperar a que el servidor arranque y ejecutar en esa misma terminal:

```powershell
$base='http://localhost:10000'
Invoke-RestMethod "$base/health"

# Primera llamada 201; segunda 200. Para ver el HTTP, usar Invoke-WebRequest.
Invoke-WebRequest "$base/api/v1/wishlist/items" -Method Post -Headers $headersA -ContentType 'application/json' -Body '{"productId":"PRD-1"}'
Invoke-WebRequest "$base/api/v1/wishlist/items" -Method Post -Headers $headersA -ContentType 'application/json' -Body '{"productId":"PRD-1"}'

# B no puede eliminar el favorito de A. Respuesta 204, A permanece intacto.
Invoke-WebRequest "$base/api/v1/wishlist/items/PRD-1" -Method Delete -Headers $headersB

# Ambos DELETE devuelven 204 sin cuerpo.
Invoke-WebRequest "$base/api/v1/wishlist/items/PRD-1" -Method Delete -Headers $headersA
Invoke-WebRequest "$base/api/v1/wishlist/items/PRD-1" -Method Delete -Headers $headersA

# Finalizar solo el proceso de esta demo.
Stop-Process -Id $backend.Id
```

Verificar persistencia mediante las pruebas automatizadas o una consulta de lectura al contenedor temporal; no existe GET de favoritos:

```powershell
docker compose -f docker-compose.test.yml exec -T postgres-test psql -U h3_test -d marketplace_h3_test -c 'SELECT customer_id, product_id, created_at FROM wishlist_items ORDER BY customer_id;'
```

No capturar cabeceras Authorization, secreto, tokens ni el contenido completo del entorno. El comando de token rechaza configuración incompleta y genera credenciales de 15 minutos solo en sandbox.

## Contrato para la IA de frontend

- URL local: `http://localhost:10000`.
- POST `/api/v1/wishlist/items`, JSON estricto `{productId}`, Bearer: 201 creado o 200 existente; ambos retornan `{productId}`.
- DELETE `/api/v1/wishlist/items/{productId}`, Bearer: 204 sin cuerpo incluso si ya estaba ausente.
- `productId` textual de hasta 100 caracteres, sin controles/espacios exteriores; nunca enviar `customerId`.
- 400 validación, 401 autenticación, 404 producto no disponible al guardar, 503 elegibilidad no disponible al guardar, 500 error interno. Formato `{code,message}`.
- La UI debe esperar confirmación del servidor, impedir acciones simultáneas y no marcar éxito en timeout/error.
- F-037/listado queda fuera. No suponer que hay una ruta para consultar el estado inicial; coordinar ese handoff sin inventar endpoints.
- Deshacer puede reutilizar POST solo tras DELETE confirmado; puede fallar por elegibilidad. G-UNDO no se considera cerrado, y no se restaura `createdAt`.
- JWT de esta demo es MOCK. No guardarlo en localStorage ni incluirlo como credencial de producción.
- Fixtures: `PRD-1` activo; `PRD-INACTIVE`/`PRD-MISSING` retornan 404; `PRD-UNAVAILABLE` retorna 503. Otros IDs son inexistentes para este mock.

OpenAPI: [openapi-h3.json](contratos/openapi-h3.json). Regenerar con `npm run docs:openapi`. Es un artefacto estático versionado, sin endpoint público nuevo de documentación. Precisiones: [contrato local](contratos/h3-favoritos.md).

## Entornos y Render

Mantener `H3_SANDBOX_ENABLED=false` o ausente en producción. Activarlo con `NODE_ENV=production` impide arrancar. Los JWT sandbox se rechazan fuera de development/test. RS256/JWKS utiliza la validación existente de carrito; no implica integración externa homologada. Sin proveedor de catálogo real, lectura/adición fallan cerradas. `/health`, `/ready`, `/` y `/live` siguen disponibles; `/live` no comprueba PostgreSQL.

`CORS_ALLOWED_ORIGINS` tiene precedencia sobre `CORS_ORIGINS`, que se conserva para Render. Las entradas deben ser orígenes HTTP(S) completos sin paths ni comodines. CORS no sustituye autorización.

Render conserva `build → prisma generate + tsc`, migración previa al arranque y `node dist/main.js`. No se ha desplegado este corte ni comprobado una URL pública. La integración real de favoritos requiere adaptadores de Seguridad/Productos homologados, no habilitar este sandbox en producción.

Fuentes técnicas consultadas: [validación NestJS](https://docs.nestjs.com/techniques/validation), [errores Prisma](https://www.prisma.io/docs/orm/reference/error-reference), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken).

## Compatibilidad de salud tras auditoria del PR #15

`/`, `/health` y `/ready` mantienen `status`, `service`, `environment`, `database.connected` y `timestamp`, con HTTP 200/503. Se retiran los conteos opcionales `database.carts` y `database.wishlistItems` para evitar consultas y exposicion de datos de negocio. Los consumidores deben usar `database.connected` para comprobar PostgreSQL. `/live` conserva su contrato y Render lo utiliza sin consultar la base.

La inspeccion del repositorio encontro consumidores por codigo HTTP en smoke y por `status` en pruebas; Render usa `/live`. No se encontraron consumidores locales de los conteos. Esta revision no acredita consumidores externos: confirmar su uso con el equipo antes de aprobar el PR.
