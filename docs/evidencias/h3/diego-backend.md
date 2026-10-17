# Evidencia individual — Diego — Backend H3 — F-036/F-038

Fecha: 16/10/2026. Entorno: Windows, PowerShell, Node 24.16.0, npm 11.13.0, Docker Desktop, PostgreSQL 16 temporal.

Repositorio: G1-Marketplace-Backend. Rama: `feat/s1-f036-f038-favoritos`, creada desde `origin/develop`.

Base inicial: `ed9582e55da30007620d5740f9e4c80d41d5ad8b`. La rama integra `develop` en `e6fc7f25e78a8b34316096839f44863f37f5e2c9` y la resolucion `f9b22a6`. Los commits estan publicados en el [PR #15](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/15), destino `develop`. Revisor principal segun SPECS: Fernando Saire; aprobacion pendiente. El plan raiz, AGENTS.md y `.audit/` son locales y no se incluyen.

Version de evidencia: revision posterior a la auditoria del PR #15, 16/10/2026. Las 22 unitarias y 36 HTTP correspondian al corte anterior a integrar carrito; el resultado conjunto es 25 unitarias, 53 HTTP y 4 del servidor mock. Ver [resolucion y validacion final](resolucion-pr-15.md).

## Clasificación y alcance

- HTTP NestJS, validación, repositorio Prisma, migración y PostgreSQL: REAL local.
- Autenticación e identificación JWT, datos ficticios A/B y elegibilidad de Productos: MOCK.
- No hay integración REAL con Seguridad/Productos ni despliegue/URL pública de este corte.
- No incluye UI ni F-037. Sigue pendiente el corte individual punta a punta completo.
- No se han cerrado tareas INT, G-AUTH, I-01 o G-UNDO ni certificado el H3 común.

Tareas relacionadas: `TASK-F036-BE-001`, `TASK-F038-BE-001`, DB/QA/DOC de ambos IDs. Fragmentos locales T01–T12 del plan raíz. No se editaron los tableros externos de SPECS.

## Fuentes, decisiones e implementación

Se leyeron paquete de Diego, matriz vigente, guía colaborativa, contratos/funcionales de favoritos, seguimiento y modelo lógico del repositorio hermano SPECS. Las specs API breves no declaran versión numérica; snapshot consultado el 16/10/2026. `AGENTS.md` local vacío, preservado.

Se reutilizó NestJS existente en develop en lugar de inicializarlo de nuevo. Se preservaron Prisma/migración, compatibilidad de arranque Render, `/`, `/health`, `/ready` y `/live`. Health consulta BD sin exponer conteos de negocio o errores del driver.

Precisiones de DTO/errores registradas antes del código en [contrato local](../../contratos/h3-favoritos.md), derivadas del plan autorizado. Revisión independiente y traslado/validación en SPECS pendientes; no equivalen a homologación externa.

Implementación por módulos de favoritos, identidad, elegibilidad y configuración; puertos inyectables para reemplazar mocks. POST intenta crear y recupera el registro existente únicamente ante el conflicto único esperado. DELETE filtra por cliente y producto sin consultar catálogo. No hay tabla User/Product ni persistencia de tokens.

## Verificación ejecutada

La tabla combina el registro original y los resultados actualizados indicados.
Para la revisión posterior a la auditoría, consultar la sección final de
[resolución del PR](resolucion-pr-15.md): typecheck, 25/53/4 pruebas, 5 de integración,
compilación TypeScript y smoke aprobados. El comando completo `npm run build`
encuentra actualmente `EPERM` al regenerar el motor Prisma en Windows; su resultado
aprobado de la tabla corresponde a la ejecución histórica anterior, no a esta revisión.

| Comando / prueba | Resultado observado |
|---|---|
| `npm ci` con lockfile final | Aprobado; instalación limpia con scripts, 606 paquetes instalados |
| `npm run build` | Aprobado: generación Prisma 5.22.0 y compilación TypeScript |
| `npm run typecheck` | Aprobado |
| `npm run lint` | Aprobado; es revisión TypeScript heredada, no ESLint/SAST |
| `npm run prisma:validate` con URL local ficticia | Esquema válido |
| `npm test` | 25 unitarias + 53 HTTP + 4 del servidor mock aprobadas (version conjunta; ver resolucion) |
| `npm run test:integration` | 5 pruebas aprobadas con PostgreSQL 16 |
| `npm run test:smoke` | Artefacto compilado arranca; health 200 y flujo 201/200/204/204/401/404/503 aprobado |
| `npm run docs:openapi` | OpenAPI versionado generado |
| `npm audit --omit=dev --json` | 0 vulnerabilidades reportadas en dependencias de producción al corte |
| `git diff --check` | Sin errores en la comprobación realizada |

Las 5 pruebas reales verifican: versión PostgreSQL/readiness, persistencia/fecha/reinicio/delete, diez POST concurrentes, aislamiento A/B y ausencia de escritura en rechazos. Concurrencia observada: un 201, nueve 200 y una fila.

HTTP cubre 201/200/204, idempotencia, cliente ajeno, productos no disponibles, fallo de elegibilidad, token ausente/alterado/expirado/sin firma/claims inválidos, cuerpo inválido, propiedades extra, DELETE sin consulta de catálogo, CORS y error interno sanitizado.

Los errores del escenario negativo de salud y del repositorio producen avisos sanitizados esperados en las pruebas; no representan pruebas fallidas. PowerShell representa la salida stderr nativa en el log con `NativeCommandError`, aunque el comando terminó con código 0 y todas las pruebas aprobadas. Hubo un fallo inicial en configuración de ConfigService del harness HTTP; se corrigió y el conjunto pasó. Las restricciones de caché npm/SWC y descarga Prisma se resolvieron con ejecución autorizada fuera del sandbox. El aviso inicial de listeners de Supertest concurrente se eliminó iniciando un listener HTTP único antes de las solicitudes; la repetición de integración pasó sin ese aviso.

Instalación inicial reportó 19 alertas moderadas en el conjunto total, incluidas herramientas de desarrollo; el audit de producción reportó cero. No se aplicaron actualizaciones mayores indiscriminadas ni se presenta el audit como prueba OWASP completa.

## Reproducción y evidencias

Seguir [guía de uso](../../H3-DIEGO-USO.md). PostgreSQL temporal: compose `docker-compose.test.yml`, host local 55432, base `marketplace_h3_test`; no se tocó la base de desarrollo. Los tests limpian solo datos ficticios A/B de la base temporal validada. No se borraron volúmenes de trabajo.

El guion de demo y handoff HTTP están en la guía. Nunca adjuntar tokens de sandbox ni secretos a capturas. Evidencia visual de UI y enlace de mockup: no aplican al alcance backend; siguen pendientes en la entrega UI separada.

Artefactos: [salida de pruebas unitarias/HTTP](pruebas-unitarias-http.txt) y [resumen PostgreSQL/smoke](pruebas-postgresql.md).

## Uso de IA y revisión humana

Herramienta: Codex; modelo exacto no registrado. Propósito: implementar el plan backend aprobado, adaptar NestJS compartido, construir pruebas y documentación. Prompt principal: «Comienza con el plan», después de preparar y revisar la guía individual.

Código generado/adaptado por IA: configuración, guard/JWT sandbox, elegibilidad mock, módulo de favoritos, filtros/validación, health, runners, pruebas, OpenAPI y documentación de esta rama. Revisión técnica de la propia IA: contratos, aislamiento de identidad, unicidad, no exposición de secretos y ejecución de pruebas; no sustituye revisión humana.

Revisión humana del código, explicación individual por Diego y aprobación de Fernando: **pendientes**. Antes de aprobar, revisar el diff, ejecutar los comandos y comprobar las decisiones locales de contrato. No se atribuye una revisión humana todavía no realizada.

## Pendientes de aceptación

- Revisión de Fernando y técnica de Leonidas/Andres donde corresponda.
- Confirmación/validación de precisiones y seguimiento en SPECS.
- PR #15 publicado hacia `develop`; revision y aprobacion del equipo pendientes.
- Handoff a UI y evidencia individual punta a punta.
- Integraciones reales y eventual despliegue, sin habilitar mocks en producción.
