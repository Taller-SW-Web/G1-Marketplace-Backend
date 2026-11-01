# Trazabilidad F-002 Login y F-003 Logout — specs ↔ código ↔ pruebas ↔ operación (BE #31, #35)

Fecha: 01/11/2026 sobre `origin/develop` `cd0b93a`. Responsable: Jim Segovia; revisor solicitado: `andreus710`. Documento de trazabilidad: **no acredita cierre, integración real ni despliegue**. #31 y #35 requieren además evidencias reales y revisión independiente, que no existen todavía.

## 1. Fuentes vigentes

| Tema | Fuente | Nota |
|---|---|---|
| Contrato F-002 | SPECS `SPECS/contrato-api/F-002-iniciar-sesion.md` | Cookie opaca, MFA, refresh serializado, introspección desactivada |
| Contrato F-003 | SPECS `SPECS/contrato-api/F-003-cerrar-sesion.md` | Logout idempotente y `remoteRevocationPending` |
| Operación / entorno | [INTEGRACION-G7-H4.md](INTEGRACION-G7-H4.md) | Variables, sesiones, purga, introspección; no se duplica aquí |
| Arquitectura | `docs/ARQUITECTURA-H4-2026-10-28.md` (PR #238, aún no en develop) | Enlazar tras su fusión |
| Evidencia previa | [F002-F003.md](evidencias/H4/jim-segovia/F002-F003.md), [SEGURIDAD-H4.md](evidencias/H4/jim-segovia/SEGURIDAD-H4.md), [INTROSPECCION-H4.md](evidencias/H4/jim-segovia/INTROSPECCION-H4.md) | Local con doble de G7. [G7-API-2026-10-23.md](evidencias/H4/jim-segovia/G7-API-2026-10-23.md) describe una verificación de la API G7 (solo API, sin BFF) |
| Evidencia en PR abiertas | PR #241 (F-003, `F003-logout-qa.md`) y PR #242 (F-002, `F002-QA-SEGURIDAD-LOCAL.md`) | No están en develop; se referencian como pendientes de fusión |

## 2. Matriz de criterios

Leyenda: **D** = prueba existente en `develop`; **#241/#242** = solo en esa PR abierta. Todas usan un doble de G7 (HTTP fixture); las marcadas PG usan PostgreSQL desechable (`AUTH_TEST_DATABASE_URL`, se omiten si no está definida). Ninguna es evidencia de G7 REAL.

### F-002 Login

| Criterio del contrato | Implementación | Pruebas (`test/auth-g7.e2e-spec.ts` salvo indicación) | Estado |
|---|---|---|---|
| Login `200` con sesión pública, sin tokens al navegador | `AuthController.login` → `G7SessionService.login/establish` | «stores only a hashed cookie and authenticated ciphertext…» (D, PG) | Local |
| MFA: sin sesión antes de OTP; cookie de desafío; consumo único | `login`, `otp` | «does not establish a session before MFA…» (D, PG); bloque «F-002 QA security negatives» (#242) | Local |
| Cookie opaca HttpOnly/SameSite, hash en BD, cifrado AES-256-GCM | `SessionStore`, `setCookie` | prueba de almacenamiento (D); atributos de cookie (#242) | Local; `Secure`/`__Host-` solo con `NODE_ENV=production`, sin prueba HTTPS |
| Refresh de un solo uso serializado, sin replay tras fallo/timeout/caída | `G7SessionService.access` | pruebas de refresh simultáneo, incierto, timeout y proceso interrumpido (D, PG) | Local |
| Expiración de sesión y desafío | `SessionStore.locked` | «expires the server session and MFA challenge…» (D, PG) | Local |
| Origin exacto en mutaciones | `assertOrigin` | «enforces CSRF and rejects token injection in bodies» (D, PG) | Local |
| JWT RS256/issuer/tipo/UUID, rol CLIENTE, HS256 acotado al sandbox | `AuthGuard`, `G7SessionService.validate` | `src/security/auth.guard.spec.ts` (D, 2 casos); `auth.guard.negative.spec.ts` (#242); «rejects signed non-customer identities…» (D, PG) | Local |
| Revocación por introspección sin fallback offline | `G7IntrospectionService`, `recheck` | `test/g7-introspection.e2e-spec.ts` (D); «rejects revoked cookie…» y «denies private access while introspection is unavailable…» (D, PG) | Local; `G7_INTROSPECTION_ENABLED=false` por defecto |
| Ownership: el cliente no elige el UUID | `SessionMiddleware`, guards | «isolates actual wishlist rows for A/B…» (D, PG) | Local |
| Errores del proveedor sin mensajes arbitrarios | `G7Client.call` | `src/auth/g7.client.spec.ts` (#242) | Local |
| Retorno tras login solo a rutas locales | Frontend | BE sin superficie: campos `redirect`/`returnTo` rechazados (#242) | FE pendiente |
| Mock H3 de login sin sesión | `AuthService` | `test/auth.e2e-spec.ts` (D) | Mock explícito, apagado por defecto |
| Rate limit | Solo reenvío del 429 de G7 | 429 acotado (#242) | **Sin límite propio**; depende de G7 |

### F-003 Logout

| Criterio del contrato | Implementación | Pruebas | Estado |
|---|---|---|---|
| Idempotente; cierre local aunque G7 falle (`remoteRevocationPending`) | `G7SessionService.logout` | «closes locally during a provider logout failure and supports repeated logout» (D, PG) | Local |
| Cookies de sesión y desafío borradas | `logout` | misma prueba; casos ampliados (#241) | Local |
| CSRF / Origin | `assertOrigin` | casos de logout (#241) | Local |
| Refresh en curso: no resucitar la sesión | `logout` bajo bloqueo de fila | caso dedicado (#241) | Local |
| Cookies `g1_session` duplicadas | `logout` | regresión y corrección del bug (#241) | Local |
| Usuario B no ve datos de A | sesión por usuario | wishlist A/B (D) y cambio A→B (#241) | Local |
| `503` si no se puede invalidar la sesión persistida | transacción de `SessionStore` | **Sin prueba dedicada** | Hueco |
| UI limpia caché privada, confirma en checkout, otra pestaña | Frontend | No cubierto en BE | FE pendiente |

## 3. Catálogo de errores relevantes (BFF → navegador)

Solo códigos del contrato; el mensaje del proveedor no se reenvía.

| HTTP | Código | Origen |
|---|---|---|
| 400 | (ValidationPipe) | DTO local; campos extra rechazados |
| 400/401/403/409/410/422 | `VALIDACION`, `CREDENCIALES_INVALIDAS`, `CODIGO_INVALIDO`, `OTP_INTENTOS_AGOTADOS`, `TOKEN_INVALIDO`, `REFRESCO_INVALIDO`, `PASSWORD_CADUCADA`, `OTP_EXPIRADO`, … | Lista blanca por estado en `G7Client` |
| 401 | `UNAUTHORIZED` | Cookie ausente o inválida en rutas privadas |
| 403 | `FORBIDDEN` | `Origin` ausente o distinto de `G1_WEB_ORIGIN` |
| 410 | `OTP_EXPIRADO` | Desafío inexistente, vencido o usado |
| 429 | `RATE_LIMITED` (+ `retryAfterSeconds` acotado) | Reenvío del 429 de G7 |
| 503 | `AUTH_UNAVAILABLE` | Timeout, red, respuesta no JSON, estado inesperado, JWKS/introspección caídos, respuesta de G7 inválida |
| 503 | `AUTH_OPERATION_UNAVAILABLE` | Registro/recuperación apagados por configuración |

Matiz: en `develop`, un access token inválido emitido por G7 se propaga como 401 `UNAUTHENTICATED`; la PR #242 lo cambia a 503 `AUTH_UNAVAILABLE`. Actualizar esta fila al fusionar.

## 4. Operación (resumen; detalle en INTEGRACION-G7-H4.md)

Variables: `AUTH_ENABLED`, `G7_API_URL`, `G1_WEB_ORIGIN`, `AUTH_SESSION_KEY` (32 bytes base64, gestor privado), `HTTP_TIMEOUT_MS`, `G7_INTROSPECTION_ENABLED` y credenciales de servicio. Purga periódica de `auth_sessions` vencidas. Rotar `AUTH_SESSION_KEY` invalida las sesiones. La migración heredada con índice duplicado sigue siendo un bloqueo de despliegue (`migrate deploy`); los tests usan `db push` solo en BD desechable.

## 5. Huecos que no se resuelven documentalmente

- **Figma:** no hay enlaces de F-002/F-003 en este repositorio ni en las specs de contrato leídas; deben aportarlos Frontend/PO. No se inventan.
- **G7 REAL:** solo hay verificación de la API G7 (23/10, sin BFF). BFF + G7 real, SHAs/URLs desplegados, DAST, G-DB y revisión independiente no existen; no hay SHA ni aprobación que citar.
- **Decisiones abiertas:** límite de tasa propio en el BFF, aceptación de los avisos moderados de desarrollo (SEGURIDAD-H4.md), cookie `Secure` verificada en HTTPS, prueba del `503` de logout, mantenimiento de purga.
- #31 y #35 permanecen abiertas hasta contar con esas evidencias.
