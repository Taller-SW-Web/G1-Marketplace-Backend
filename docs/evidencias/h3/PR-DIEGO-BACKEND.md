## Alcance

Implementa el backend de F-036 (agregar favorito) y F-038 (quitar favorito) sobre NestJS, Prisma y PostgreSQL local. Es un avance parcial H3: identidad y elegibilidad de Productos son MOCK de sandbox.

## Comportamiento y cambios

- `POST /api/v1/wishlist/items`: 201 al crear y 200 si ya existe; conserva `createdAt`, incluso ante concurrencia, respaldado por la unicidad cliente/producto.
- `DELETE /api/v1/wishlist/items/{productId}`: 204 al eliminar o si ya estaba ausente, acotado al cliente autenticado y sin consultar catálogo.
- Identidad derivada del Bearer token, cuerpo limitado a `productId`, validación y errores sanitizados.
- JWT sandbox con validación de algoritmo, emisor, audiencia y expiración; bloqueo en producción y puertos inyectables para sustituir los mocks.
- Integración con el carrito de `develop`, conservando autenticación RS256/JWKS, validación, errores y CORS compartido.
- PostgreSQL 16 temporal aislado, scripts de tokens, integración y smoke; OpenAPI, guía de uso y evidencias.
- Pruebas para idempotencia, aislamiento A/B, concurrencia, persistencia y regresiones del carrito.

## Validación registrada antes de la auditoría

Tras integrar `develop`: 25 unitarias, 53 HTTP y 4 del servidor mock aprobadas; build, typecheck e instalación limpia verificados. Integración local: 5 pruebas aprobadas con PostgreSQL 16. Resultados y ajustes posteriores: [resolución](docs/evidencias/h3/resolucion-pr-15.md).

## Ajustes por auditoría

- Se restauran `service`, `environment`, `database.connected` y `timestamp` en `/`, `/health` y `/ready`. Se retiran solo los conteos opcionales de negocio; consumidores locales revisados y migración documentada. Confirmación de consumidores externos pendiente con el equipo.
- Evidencias y log sincronizados con la rama publicada y el corte conjunto: 25 unitarias, 53 HTTP, 4 del servidor mock y 5 de integración PostgreSQL aprobadas tras la auditoría.
- OpenAPI documenta ambos códigos 400 del POST mediante ejemplos nombrados; esquema y ejemplos de salud actualizados desde el generador.
- Typecheck, compilación TypeScript y smoke del artefacto compilado aprobados en el corte anterior. En el seguimiento del 16/10/2026, `npm run build` completo pasó en una copia limpia de `de049b1` con dependencias nuevas y descarga autorizada del motor Prisma fuera del sandbox. Ver [evidencia del build](docs/evidencias/h3/build-limpio-pr-15.md); es validación local, no un check publicado en GitHub. Las otras suites no se repitieron en este seguimiento.

## Pendientes

Confirmar con el equipo el uso externo de los conteos retirados de salud, registrando responsable, fecha y sistemas revisados. Sin consumidores externos, no se requiere otro cambio de código por ese punto.

No incluye UI, listado F-037, autenticación real ni elegibilidad real de Productos. La restauración de deshacer depende de F-036 y G-UNDO. No cierra tareas de integración ni acredita el flujo integral o un despliegue de producción.

Relacionados: `TASK-F036-BE-001`, `TASK-F038-BE-001` y DB/QA/DOC. Revisor principal según SPECS: Fernando Saire; aprobación pendiente. Ver [guía](docs/H3-DIEGO-USO.md) y [evidencia individual](docs/evidencias/h3/diego-backend.md).
