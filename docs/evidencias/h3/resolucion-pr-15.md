# Resolucion del PR #15 hacia develop

Fecha local: 2026-10-16.
PR: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/15
Rama: `feat/s1-f036-f038-favoritos`; destino: `develop`.
Base integrada: `e6fc7f25e78a8b34316096839f44863f37f5e2c9`.

## Resultado

Se combinan favoritos y carrito en AppModule, junto con sus variables de entorno y scripts.
Se mantienen la identidad sandbox de favoritos y la autenticacion RS256 del carrito.
La validacion especifica del DTO de favoritos no modifica los errores de validacion del carrito.
El filtro de errores conserva los contratos del carrito, incluido el 503 de JWKS no disponible.
CORS usa origenes explicitos, permite credenciales y conserva los metodos y encabezados del carrito.
No se agregan endpoints ni migraciones.

## Validacion

- `npm ci --offline --no-audit --no-fund`: aprobado en copia temporal limpia.
- `npm run typecheck`: aprobado en el proyecto.
- `npm test`: 25 unitarias, 53 HTTP y 4 del servidor mock, todas aprobadas.
- `npm run build`: aprobado en el proyecto.
- `npm run test:integration`: 5 pruebas aprobadas en PostgreSQL 16 temporal local,
  usando exclusivamente `marketplace_h3_test` en el puerto 55432.
- La suite HTTP conjunta carga AppModule y comprueba cookies anonimas, RS256,
  errores 401/503, validacion y conflictos del carrito, favoritos, CORS y salud.

El primer npm ci local encontro el motor Prisma bloqueado por Windows. Se verifico
la instalacion limpia en una copia temporal y se restauraron las dependencias locales,
reconstruyendo SWC y generando Prisma antes de las comprobaciones finales.
Jest excluye `.audit/` para evitar colisiones con copias locales del proyecto.
El cambio previo del lockfile permanece respaldado en el stash y `.audit/` no se incluye.

## Respuesta a la auditoría del PR #15 — 16/10/2026

1. Salud: se restauran `service`, `environment`, `database.connected` y `timestamp`
   para `/`, `/health` y `/ready`, con los mismos estados HTTP 200/503.
   Se conserva la retirada de los conteos opcionales `database.carts` y
   `database.wishlistItems`: readiness ejecuta únicamente `SELECT 1`.
   Las pruebas unitarias verifican ambas respuestas, sin conteos ni errores del driver;
   integración verifica el contrato completo de las tres rutas sobre PostgreSQL real.
   La búsqueda en README, Render, scripts, documentación y pruebas no encontró
   consumidores locales de los conteos; smoke usa HTTP y Render usa `/live`.
   El uso externo de esos conteos debe confirmarse con el equipo antes de aprobar;
   no se declara compatibilidad externa sin evidencia. Migración documentada en la guía.
2. Evidencia: la rama correcta es `feat/s1-f036-f038-favoritos`, publicada en el PR #15.
   Las 22 unitarias y 36 HTTP eran del corte inicial anterior a integrar carrito;
   se actualizan evidencia individual, descripción del PR y log al corte conjunto:
   **25 unitarias, 53 HTTP y 4 del servidor mock**. La tabla inicial de comandos
   de la evidencia individual conserva otros resultados históricos; no implica que
   se hayan repetido instalación, audit o validación de Prisma en esta revisión.
3. OpenAPI: el POST 400 incluye ejemplos nombrados `INVALID_REQUEST` y
   `INVALID_PRODUCT_ID` en el generador y en el JSON regenerado. El esquema y los
   ejemplos de salud también reflejan los campos restaurados.

Validación posterior a la auditoría:

- `npm run docs:openapi` y `npm run typecheck`: aprobados.
- `npm test`: 25 unitarias, 53 HTTP y 4 del servidor mock aprobadas.
  SWC no cargó en el sandbox; la repetición autorizada fuera del sandbox pasó.
- `npm run test:integration`: 5 aprobadas en PostgreSQL 16 temporal, sin migraciones
  pendientes, exclusivamente `marketplace_h3_test` en puerto 55432.
- `npm run build`: bloqueado al regenerar el motor Prisma por `EPERM` en Windows,
  también fuera del sandbox. No se cambió el esquema ni se detuvieron procesos ajenos.
  La compilación TypeScript se verifica por separado con el cliente ya generado.
- `node node_modules/typescript/bin/tsc -p tsconfig.build.json`: aprobado.
- `npm run test:smoke`: aprobado sobre el artefacto recién compilado y PostgreSQL
  temporal; health 200 y flujo 204/201/200/204/204/401/404/503.
- `git diff --check`: aprobado tras normalizar el log a UTF-8 sin espacios finales.

La descripción del PR ya está publicada. UI, F-037, integración real de identidad y
Productos, deshacer/G-UNDO y aprobación humana siguen pendientes. No se modificaron
tableros externos ni se declara cierre integral de F-036/F-038.
