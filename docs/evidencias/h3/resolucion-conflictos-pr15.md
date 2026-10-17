# PR #15 — resolución de conflictos y registro para auditoría

Fecha local: 17/10/2026. PR: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/15
Rama: `feat/s1-f036-f038-favoritos`, destino `develop`.

## Estado y límites vigentes

El usuario prohibió acceder o modificar bases de datos durante esta resolución.
Desde esa instrucción no se ejecutaron migraciones, SQL, integración, smoke ni
fixtures. Se retiró la aplicación automática de migraciones del runner y las
operaciones con BD del CI. La validación final usa compilación, análisis estático
y pruebas unitarias/HTTP con dobles; no acredita una nueva prueba PostgreSQL tras
esta restricción. No se revirtieron operaciones previas: hacerlo volvería a modificar BD.

Favoritos sigue leyendo una lista propia y agregando una unidad al carrito sin
eliminar el favorito ni cambiar su fecha. No existe wishlist_moves ni se agregó una
migración de favoritos. La integración incorpora archivos de checkout e historial
que ya pertenecen a develop; no se atribuyen como implementación propia de favoritos.

## Referencias comparadas y método

| Referencia | Commit |
|---|---|
| HEAD previo del PR, ya publicado | `3d7c458156d0c54105110d1ce9dbe2a1b04488f2` |
| develop integrado | `040d5fb5a9601a7cf4b80b2f1aa2166b186f1272` |
| Ancestro común | `e6fc7f25e78a8b34316096839f44863f37f5e2c9` |

GitHub informó CONFLICTING/DIRTY. Se actualizó origin y se inició
`git merge --no-commit --no-ff origin/develop`, manteniendo la historia mediante
merge, sin rebase ni force push. develop incorporó los PR #10 (checkout) y #14
(historial). El intento previo de merge-tree no pudo escribir objetos dentro del
sandbox; no alteró archivos de trabajo. El merge autorizado identificó seis conflictos.

## Resolución de los seis conflictos

| Archivo | Decisión y razón verificable |
|---|---|
| `.env.example` | Unión de variables: sandbox de favoritos, AUTH/JWKS, mocks de checkout, ORDERS_SOURCE y escenarios de proveedores. Solo archivo de ejemplo; no se modificó un .env real. |
| `.github/workflows/backend-ci.yml` | Un workflow para PR y pushes a main/develop/rama del PR; matriz Node 22 y 24. Conserva instalación limpia, build, esquema estático, lint/TypeScript, unitarias/HTTP/mock y OpenAPI. Tras la restricción se eliminaron servicio PostgreSQL, migraciones, integración y smoke. URL de validación sintáctica en puerto 1; no hay servidor BD. |
| `package.json` | Conserva scripts de favoritos y npm test compuesto (unitarias + HTTP + mock-auth), incorpora @nestjs/axios y axios-mock-adapter de checkout. Lockfile integrado por Git y comprobado con instalación limpia, sin actualizar versiones indiscriminadamente. |
| `src/app.module.ts` | Registra Wishlist, Cart, Checkout, Orders, Health y Prisma. Unifica la validación de entorno en src/config/environment.ts; no conserva una segunda implementación divergente dentro de AppModule. |
| `src/main.ts` | Usa configureApp como arranque compartido. La configuración de checkout que antes estaba inline se integra en ese helper, en vez de ejecutar dos configuraciones globales. |
| `src/security/auth.guard.ts` | Mantiene authenticate compartido y HS256 sandbox restringido, incorpora la ausencia de defaults localhost para RS256/JWKS. Algoritmos no admitidos/malformados devuelven 401; RS256 sin configuración devuelve 503; no se confía en sub sin verificar firma/claims. |

## Ajustes semánticos necesarios además de quitar marcadores

- Entorno: conserva los límites de sandbox/CORS y las restricciones de develop.
  USE_MOCKS por defecto false, valor validado y prohibido true en producción;
  ORDERS_SOURCE solo mock/unconfigured, mock prohibido en producción;
  HTTP_TIMEOUT_MS entero de 1 a 30000, normalizado a número; AUTH sin defaults de
  loopback en producción. El ejemplo local mantiene mocks explícitos.
- CORS: helper único con credenciales/orígenes explícitos, métodos de carrito y
  DELETE de favoritos, Idempotency-Key de checkout y x-customer-id heredado.
  Esto no introduce idempotencia durable en add-to-cart ni acepta titular por cabecera.
- Validación: DTO de favoritos conserva INVALID_REQUEST/INVALID_PRODUCT_ID;
  exclusivamente los DTO de checkout usan su fábrica de códigos por campo;
  carrito e historial conservan el formato estándar. Evita clasificar una petición
  de otro módulo como checkout solo porque incluya un campo con nombre coincidente.
- Filtro: conserva los 404 estructurados de checkout `{error:{code}}`, mientras que
  una ruta inexistente mantiene `{error:"Ruta no encontrada"}`. ApiError de favoritos
  mantiene su formato propio y sanitización.
- Nuevas regresiones combinadas: validación de dirección de checkout y carrito,
  404 de operación, preflight Idempotency-Key con DELETE permitido y registro del
  historial mock junto al resto de módulos. Entorno y autenticación prueban cierre
  en producción, flags/timeouts inválidos y configuración RS256 ausente.

## Registro de las operaciones sobre BD ya realizadas

No hubo una necesidad nueva de esquema por favoritos. El agente ejecutó el runner
de integración sin separar su paso automático de migraciones: esa elección aplicó
la migración de checkout importada desde develop. El usuario objetó esa operación
y prohibió nuevos accesos. El automatismo fue retirado; no se atribuye la decisión
a una exigencia funcional del botón de favoritos.

Antes de esa prohibición se ejecutaron:

- `docker compose -f docker-compose.test.yml up -d --wait`, sobre el contenedor temporal.
- `npm run test:integration` con TEST_DATABASE_URL explícita a 127.0.0.1:55432,
  base marketplace_h3_test. El runner aplicó
  `20261016122000_checkout_prepared_context`, ya existente en develop, y ejecutó
  escrituras/limpieza de fixtures A/B en favoritos y carrito.
- `npm run test:smoke` contra el artefacto compilado y esa misma base temporal:
  guardó/eliminó favoritos de prueba y agregó una línea al carrito. El smoke limpia
  su favorito, no elimina esa línea del carrito. No se afirma que la BD quedó intacta.

La migración de checkout añade contexto preparado y clave de orden a
checkout_operations; no crea wishlist_moves. Su archivo y el esquema Prisma
coinciden con origin/develop: `git diff origin/develop -- prisma` no mostró diferencias.
No se ejecutaron estos comandos contra la base de desarrollo ni producción.
La migración quedó aplicada en la base temporal; no se deshizo ni se consultó su
estado después de la instrucción. Este registro no certifica una reversión.

## Corrección para impedir repetición automática

- scripts/integration-test.ts ya no contiene el paso prisma migrate deploy.
- Integración, smoke, fixtures y las dos suites PostgreSQL verifican autorización
  explícita de escrituras de prueba antes de crear clientes, iniciar la app o acceder
  a la BD. H3_ALLOW_TEST_DATABASE_WRITES debe ser true; no se activó durante esta corrección.
- El CI no tiene servicio BD ni pasos de integración/smoke/fixtures/deploy.
- Las guías marcan sus procedimientos PostgreSQL como históricos y suspendidos
  bajo la restricción actual. No se ejecutó un rollback ni se borraron tablas.
- Los comandos Prisma de administración siguen disponibles para el responsable de
  BD; no se ejecutan como parte de build, npm test ni del CI. Generar el cliente y
  validar sintácticamente un esquema no aplica migraciones ni se conecta a PostgreSQL.

## Validación: cortes separados y fallos observados

Entorno local: Windows/PowerShell, Node 24.16.0, npm 11.13.0, Prisma 5.22.0.

| Comando | Resultado y alcance |
|---|---|
| npm ci --offline --no-audit --no-fund | 0; 614 paquetes, instalación limpia después del merge, aviso glob. Antes eran 606: se incorporan dependencias de checkout. |
| npm run build | 0; generación Prisma y TypeScript. El primer intento restringido no accedió a binaries.prisma.sh; repetición autorizada fuera del sandbox pasó. Build final posterior a la corrección de autenticación: 0. |
| npm run typecheck | 0; repetido después de bloquear los scripts con escrituras. |
| npm test final, sin BD real | 0; 76 unitarias/12 suites, 78 HTTP/6 suites, 4 mock-auth. Repetido después de la prohibición con estos mismos resultados. |
| npm run prisma:validate | 0 con URL ficticia de sintaxis; primer intento falló P1012 por DATABASE_URL ausente. No se conectó a un servidor ni se migró con este comando. |
| npm run docs:openapi | 0; JSON sin diferencias respecto del contrato previo. |
| npm run test:integration, anterior a la prohibición | 0; 21 pruebas PostgreSQL/2 suites, dos migraciones con la nueva de checkout aplicada. No se repitió después. |
| npm run test:smoke, anterior a la prohibición | 0; salud 200, POST 201/200, DELETE 204, errores 401/404/503, GET 200 y add-to-cart 200 conservando favorito. No se repitió después. |

La primera regresión pasó 76 unitarias pero falló dos HTTP (HS384 y token sin firma:
503 en lugar de 401). Se corrigió la selección de algoritmo antes de exigir
configuración RS256; no se relajó la validación ni se cambiaron las expectativas
para ocultar el fallo. La repetición final aprobó 76/78/4.

Los avisos sanitizados de readiness/500 corresponden a escenarios negativos esperados.
Los conteos 32/56/4/21 del corte anterior a integrar develop siguen siendo históricos;
el aumento actual incluye las suites de checkout/historial y regresiones del merge.
Los resultados de CI deben consultarse en el commit publicado, sin inferir que
una prueba PostgreSQL se ejecutó por un check verde del workflow actual.

## Ruta de revisión y pendientes

Commits previos: aacb454 (build auditado), e0147eb (lectura/adición conservando
favorito), c59f577 (CI inicial), 3d7c458 (contrato y evidencia). Este merge integra
develop y modifica los automatismos según la instrucción posterior del usuario.

Para revisar sin BD, comparar el commit de resolución contra sus dos padres:
`git show --format=fuller --no-patch <merge>` y
`git diff 3d7c458 <merge> -- <archivo>` para las decisiones documentadas;
`git diff 040d5fb <merge> -- prisma` debe permanecer vacío.

Siguen pendientes consumidores externos de los conteos de salud, adaptación BFF/UI
a add-to-cart conservando tarjeta, revisión humana e integraciones/gates externos.
No se certifican F-039 original, G-UNDO, producción ni aceptación UI integral.
