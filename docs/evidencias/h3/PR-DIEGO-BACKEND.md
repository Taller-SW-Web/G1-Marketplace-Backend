## Alcance

Amplía favoritos F-036/F-038 con lectura F-037 y adición al carrito que conserva el
favorito. Usa NestJS, Prisma y PostgreSQL reales locales; identidad de demostración,
catálogo y condiciones comerciales son MOCK. La decisión explícita del usuario
sustituye el movimiento/eliminación y la idempotencia durable del handoff inicial;
no acredita cumplimiento de F-039 original ni integración externa homologada.

## Comportamiento y cambios

- `POST /api/v1/wishlist/items`: 201 al crear y 200 si ya existe; conserva `createdAt`, incluso ante concurrencia, respaldado por la unicidad cliente/producto.
- `DELETE /api/v1/wishlist/items/{productId}`: 204 al eliminar o si ya estaba ausente, acotado al cliente autenticado y sin consultar catálogo.
- `GET /api/v1/wishlist`: arreglo del titular ordenado por fecha; distingue vacío,
  agotados, retirados y fallo de catálogo, sin exponer customerId.
- `POST /api/v1/wishlist/items/{productId}/add-to-cart`: 200 con snapshot confirmado;
  una unidad por solicitud, sin cuerpo ni clave idempotente. Conserva favorito y fecha.
- Reutiliza CartService y coordina escrituras concurrentes por titular. No agrega
  tablas ni migraciones; los fallos revierten escrituras. No existe `/move-to-cart`.
- Ante timeout consultar carrito; una nueva petición puede sumar otra unidad.
- Identidad derivada del Bearer token, cuerpo limitado a `productId`, validación y errores sanitizados.
- JWT sandbox con validación de algoritmo, emisor, audiencia y expiración; bloqueo en producción y puertos inyectables para sustituir los mocks.
- Integración con el carrito de `develop`, conservando autenticación RS256/JWKS, validación, errores y CORS compartido.
- PostgreSQL 16 temporal aislado, scripts de tokens, integración y smoke; OpenAPI, guía de uso y evidencias.
- Pruebas para idempotencia, aislamiento A/B, concurrencia, persistencia y regresiones del carrito.

## Validación de la ampliación

Ver [evidencia vigente](docs/evidencias/h3/integracion-frontend.md) para comandos,
resultados y diferencia con los cortes históricos siguientes. Se agrega CI con
instalación limpia, build completo, regresión, PostgreSQL 16, smoke y verificación
de OpenAPI generado. Consultar el resultado publicado del commit en los checks del PR.

Entrega: [contrato vigente y ajustes necesarios del BFF](docs/FAVORITOS-FRONTEND-HANDOFF.md)
y [fixtures/conexión](docs/H3-FAVORITOS-INTEGRACION.md). El repositorio frontend no se modifica.

## Validación registrada antes de la auditoría

Tras integrar `develop`: 25 unitarias, 53 HTTP y 4 del servidor mock aprobadas; build, typecheck e instalación limpia verificados. Integración local: 5 pruebas aprobadas con PostgreSQL 16. Resultados y ajustes posteriores: [resolución](docs/evidencias/h3/resolucion-pr-15.md).

## Ajustes por auditoría

- Se restauran `service`, `environment`, `database.connected` y `timestamp` en `/`, `/health` y `/ready`. Se retiran solo los conteos opcionales de negocio; consumidores locales revisados y migración documentada. Confirmación de consumidores externos pendiente con el equipo.
- Evidencias y log sincronizados con la rama publicada y el corte conjunto: 25 unitarias, 53 HTTP, 4 del servidor mock y 5 de integración PostgreSQL aprobadas tras la auditoría.
- OpenAPI documenta ambos códigos 400 del POST mediante ejemplos nombrados; esquema y ejemplos de salud actualizados desde el generador.
- Typecheck, compilación TypeScript y smoke del artefacto compilado aprobados en el corte anterior. En el seguimiento del 16/10/2026, `npm run build` completo pasó en una copia limpia de `de049b1` con dependencias nuevas y descarga autorizada del motor Prisma fuera del sandbox. Ver [evidencia del build](docs/evidencias/h3/build-limpio-pr-15.md); es validación local, no un check publicado en GitHub. Las otras suites no se repitieron en este seguimiento.

## Pendientes

Confirmar con el equipo el uso externo de los conteos retirados de salud, registrando responsable, fecha y sistemas revisados. Sin consumidores externos, no se requiere otro cambio de código por ese punto.

Quedan pendientes adaptar y aceptar el BFF/UI de adición conservando tarjeta,
integraciones reales, G-UNDO y demás gates externos. Los flags nuevos deben permanecer
desactivados hasta adaptar/probar el frontend; MOVE sigue false. No acredita el flujo
integral ni un despliegue de producción. Revisión humana y aprobación siguen pendientes.

Relacionados: `TASK-F036-BE-001`, `TASK-F038-BE-001` y DB/QA/DOC. Revisor principal según SPECS: Fernando Saire; aprobación pendiente. Ver [guía](docs/H3-DIEGO-USO.md) y [evidencia individual](docs/evidencias/h3/diego-backend.md).
