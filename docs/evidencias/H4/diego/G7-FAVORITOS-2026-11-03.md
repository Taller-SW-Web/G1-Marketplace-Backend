# F-036: conexión con la sesión G7 compartida

Fecha: 03/11/2026. Responsable del bloque favoritos: Diego Espinoza. Revisor: Fernando Saire.

Issue: [#175](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/175). PR: [Backend #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239), [Frontend #118](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118). Integración de cuenta reutilizada: Jim Segovia, [Backend #229](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/229) y [Frontend #105](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/105), ambos fusionados.

## Resultado

La conexión de código ya existe y pasó los escenarios añadidos; no se necesitó duplicar login, sesiones, guards ni cambiar endpoints o modelos. Este cambio completa la verificación local específica del alta F-036 mediante la autenticación compartida y separa su evidencia de la homologación pendiente de G6.

**Esto no certifica G7 REAL, un deployment ni el cierre de #175/#177.** Falta la prueba autorizada con el corte desplegado y usuarios A/B, la aceptación de Fernando y los gates aplicables. No se usaron cuentas, tokens ni bases compartidas. No se activaron flags de producción.

## Recorrido reutilizado

1. Next utiliza `authRequestGuard` y `bffFetch`; envía sólo las cookies opacas G1, sin aceptar Bearer ni propietario del navegador.
2. `SessionMiddleware`, instalado globalmente por `AuthModule`, reconoce `/api/v1/wishlist`, recupera/renueva la sesión persistida y entrega el access token internamente al guard existente.
3. `IdentityGuard` delega en el adaptador de identidad y en `AuthGuard`, que verifica RS256/JWKS/claims y la introspección cuando está configurada. El nombre histórico `SandboxIdentityAdapter` no implica un bypass: llama al guard compartido.
4. El controlador obtiene `customerId` del principal autenticado. El servicio comprueba elegibilidad de producto mediante su puerto G6 y el repositorio mantiene la unicidad `(customerId, productId)`.

## Pruebas añadidas

En `test/auth-g7.e2e-spec.ts` se reutiliza el fixture G7 de Jim: servidor HTTP loopback, RSA/RS256, JWKS, login/MFA/refresh/logout, middleware y guards reales de G1, y sesiones/favoritos en PostgreSQL 16 temporal. Identidad sandbox desactivada (`H3_SANDBOX_ENABLED=false`). El puerto de elegibilidad G6 se sustituye explícitamente por un doble independiente; no se homologa Productos con esta prueba.

| Escenario nuevo | Resultado comprobado |
|---|---|
| Alta A, repetición A y alta B del mismo producto | 201/200/201, dos filas independientes, `createdAt` conservado y ningún refresh innecesario |
| Sin sesión y desafío MFA sin completar | 401 sin consultar G6 ni escribir; OTP válido habilita alta del titular |
| Sesión vencida y cookie reutilizada después de logout | 401, sin consultar G6 ni persistir |
| Access token vencido con sesión renovable | Un refresh del componente compartido, propietario B conservado y repetición idempotente |
| Timeout del refresh de un uso | 503, sin favorito; sesión invalidada, siguiente intento 401 y sin replay del refresh |
| Propietario en body/query, Bearer forjado y origen ausente/ajeno | 400/401/403 según caso, antes de G6 o persistencia |
| Introspección indisponible o token revocado | 503/401 sin alta; el fallo transitorio conserva la sesión |
| G6 indisponible y recuperación posterior | 503 sin favorito, sesión A vigente; alta 201 cuando se recupera elegibilidad |

Frontend: `tests/server/auth-g7.test.ts` añade cuatro casos ejecutados: POST 201 y 200 conserva cookie/cuerpo/respuesta segura, inyección de propietario rechazada, y fallo de transporte como `504 RESULT_UNCERTAIN` sin retry ni fallback sandbox. Se conserva la cobertura existente de lectura/borrado y la suite F-039 de cookie A/B.

## Ejecución del 03/11/2026

| Comprobación | Resultado |
|---|---|
| `node scripts/test-diego-isolated.mjs` | Salida 0; contenedor propio eliminado al terminar |
| Cadena de migraciones | Cuatro migraciones en PostgreSQL 16 desechable; segunda aplicación sin pendientes |
| Suites de integración existentes | 5 suites, 41 pruebas aprobadas |
| Sesión G7 + favoritos | 21 pruebas aprobadas: 13 previas y 8 nuevas |
| Frontend servidor dirigido | 47 pruebas aprobadas: 31 auth G7, incluidas 4 nuevas, y 16 F-039 |
| Typecheck FE y BE | Ambos aprobados |

Los proveedores G7/G6 son controlados; PostgreSQL y las verificaciones criptográficas son reales locales. Las 47 pruebas frontend ejercitan los handlers con fetch controlado; las 21 backend ejercitan HTTP G7 loopback y persistencia. No se presenta la combinación como una nueva prueba de navegador→Next→Nest contra proveedores externos. La evidencia previa de navegador conectado con identidad sandbox permanece separada.

Las dependencias existentes se reutilizaron mediante junction; no se hizo instalación limpia. Las suites están incluidas en los runners existentes: la suite G7 requiere `AUTH_TEST_DATABASE_URL` y se ejecuta dentro de `test:diego:isolated`, incluso en el workflow H4; no debe contarse como aprobada cuando el runner HTTP general la omita por falta de DB.

## Pendientes separados

- **G7 compartido / despliegue:** confirmar URL, SHAs efectivos, acceso A/B por canal seguro, configuración de sesión/JWKS y permisos de introspección si se activa; ejecutar el flujo autorizado del titular con favoritos. Coordinar con Jim/owner del despliegue, sin reimplementar su módulo.
- **G6 / #177:** homologar contrato/versiones, rutas/grants, producto activo/no disponible, errores/timeout y evidencia desde la web desplegada. La elegibilidad controlada de esta corrida no libera I-01.
- **Revisión:** Fernando revisa los escenarios y la evidencia; cuando haya aportado al artefacto, aplicar segunda revisión independiente a esa parte.

Conclusión del corte: conexión y pruebas locales de autenticación listas para revisión; G6 puede abordarse como siguiente bloque. El cierre integral de la issue conserva sus condiciones REAL/despliegue y aprobación.

## Revalidación al integrar la base actualizada

El PR #239 tenía conflictos con `develop`, por lo que GitHub no ejecutaba sus checks nuevos. Se incorpora `develop` `cae04f78f40fd10fa3106aca38d25488d8181497` mediante merge hacia la rama del PR, sin publicar ni fusionar el PR en `develop`.

- `test/auth-g7.e2e-spec.ts`: se conserva el seguimiento de logout añadido por Jim y el reset de elegibilidad de las pruebas F-036. Se mantienen las ocho pruebas nuevas de favoritos y las correcciones de cuenta/sesión que ya estaban en la rama base.
- `test/checkout.integration-spec.ts`: se conserva íntegra la versión actual de Leonidas integrada en #262, con sus aserciones PostgreSQL y casos separados. Sustituye la corrección equivalente anterior del candidato, sin cambiar producción ni esquema de Checkout.
- Corrida aislada sobre la resolución: **44 integración + 26 sesión G7 aprobadas**. Las 26 incluyen 18 existentes de la base actualizada y 8 nuevas de F-036; sustituyen los totales anteriores de 41/21 para este candidato final. Cuatro migraciones, repetición sin pendientes y limpieza del contenedor propio aprobadas.
- Typecheck y **260 unitarias** aprobados sobre la resolución. HTTP general: **291 aprobadas y 30 omitidas** por falta de DB de sesión en ese runner; las **26 de sesión G7** se ejecutaron y aprobaron por separado con el runner aislado. Las cuatro de cuenta que requieren DB no se presentan como ejecutadas localmente en este corte. CI del candidato final se registra en el seguimiento del PR.

La autenticación productiva incorporada en el merge corresponde al trabajo existente del equipo. El aporte específico F-036 continúa limitado a pruebas y documentación de reutilización; las condiciones REAL/despliegue y revisión no se promueven por resolver conflictos.
