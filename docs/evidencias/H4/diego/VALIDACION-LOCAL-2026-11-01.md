# Backend local de Diego — 01/11/2026

Validación preparada desde `65ee5e0cb5a1a757c1dcef7e6d6adb6d6c9544cf`. Publicación separada: ejecutor en `feat/diego-h4-favoritos-csat` (commit `87edc10`, PR #239); este documento en `docs/diego-h4-seguimiento-issues`. La rama provisional `chore/diego-backend-local-verification` no se publica. Se preservó `.f037-update.py` sin seguimiento. No se modificaron frontend, contratos públicos, modelos ni migraciones.

## Resultados actuales

| Control | Resultado |
|---|---|
| npm run build | Aprobado; Prisma generado y TypeScript compilado |
| npm run typecheck | Aprobado |
| npm run test:unit | 19 suites, 170 pruebas aprobadas |
| npm run test:e2e | 15 suites, 207 pruebas aprobadas; 13 pruebas de sesiones omitidas por falta de base específica |
| npm run test:diego:isolated | Bloqueado: daemon Docker no disponible; ninguna prueba PostgreSQL ejecutada |
| git diff --check | Sin errores |
| npm audit --json | 22 vulnerabilidades: 3 bajas, 18 moderadas, 1 alta, 0 críticas; sin remediación en este cambio |

Los primeros intentos dentro del sandbox fallaron por permisos de artefactos/carga SWC; build, typecheck y suites se repitieron fuera del sandbox. Los resultados corresponden a suites completas, no exclusivamente a tareas de Diego. No sumar las ejecuciones históricas.

## Trazabilidad comprobada por inspección

| Issues | Código existente | Casos existentes | Estado local |
|---|---|---|---|
| #175–179 / F-036 | WishlistService, PrismaWishlistRepository, WishlistController | test/wishlist.e2e-spec.ts: alta/repetición, elegibilidad, identidad, campos; test/wishlist.integration-spec.ts: unicidad y concurrencia | HTTP validado; persistencia actual bloqueada por Docker |
| #180–184 / F-037 | WishlistReadService | src/wishlist/wishlist-read.service.spec.ts: orden, aislamiento de consulta, vacío, concurrencia acotada, fallo de catálogo; test/wishlist-handoff.integration-spec.ts: proyección por titular | Unitarias validadas; BD pendiente |
| #185–189 / F-038 | WishlistService.remove y repositorio filtrado por titular | test/wishlist.e2e-spec.ts: DELETE repetido/ajeno; test/wishlist-handoff.integration-spec.ts: restauración y producto retirado | HTTP validado; restauración persistida pendiente |
| #190–194 / F-039 | WishlistCartService.add: transacción y bloqueo de titular compartido con carrito; conserva favorito | test/wishlist-handoff.integration-spec.ts: cantidad acumulada, concurrencia, rollback, fecha, stock y aislamiento | Código inspeccionado; prueba transaccional actual pendiente |
| #195–199 / F-040 | CsatService, SubmitCsatDto, SalesCsatGateway | test/csat.e2e-spec.ts: mapeo, identidad, gates, timeout y errores; test/csat.integration-spec.ts: persistencia y reconciliación | HTTP validado; persistencia actual pendiente |

La existencia de pruebas no acredita haberlas ejecutado si requieren PostgreSQL. No se verificó exhaustivamente cada criterio de aceptación ni comentarios/revisiones remotas en este corte. No se declara cobertura completa.

## Cambio implementado

El ejecutor aislado verifica disponibilidad del daemon Docker antes de crear contenedores, con timeout de 10 segundos y mensaje accionable. No imprime configuración, credenciales ni stderr de Docker. Se comprobó la ruta de fallo con el daemon ausente; la ruta exitosa sigue pendiente.

## Dependencias y siguientes pasos

1. Iniciar Docker Desktop, verificar `docker info` y repetir `npm run test:diego:isolated`. El ejecutor aplica la cadena de migraciones dos veces en PostgreSQL 16 temporal y ejecuta integración y sesiones persistidas.
2. Completar auditoría criterio por criterio y scans SAST/secretos; no se certifican con evidencia histórica. Revisar resultado de auditoría npm separado.
3. #208: registrar este avance solo para F-036–040; #214: integración REAL/UI desplegada pendiente; #219: no se ejecutó carga ni se confirmó proveedor de eventos.
4. Mantener gates externos desactivados. G7/G6/G5, grants, datos autorizados, prompts SHOWN y revisión independiente siguen siendo requisitos para homologación real. No crear show/dismiss ni persistencia local del rating.

La evidencia histórica menciona contratos que movían el favorito; el servicio actual agrega conservando favorito y fecha. Este es el comportamiento adoptado; no se alteró el API.

No se cerraron issues, abrieron nuevos PR, enviaron mensajes ni desplegaron servicios. El PR #239 permanece en borrador; las actualizaciones de su rama no implican merge. La entrega del plan completo continúa pendiente de PostgreSQL, auditoría detallada y controles de seguridad. Los resultados npm actuales sustituyen cualquier afirmación histórica de ausencia de vulnerabilidades moderadas/altas para este corte.
