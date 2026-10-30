# F-002 — QA seguridad local (BE #28, #29, #30, #31)

Fecha: 30/10/2026. Rama `test/jim-f002-qa-20261030` sobre `origin/develop` (`cd0b93a`). Responsable: Jim Segovia. Revisor solicitado: `andreus710`. Asistencia de IA (Claude Code) en pruebas y documentación; aceptación humana y revisión independiente **pendientes**.

> **Toda la evidencia de este documento es LOCAL y con dobles.** G7 es un servidor HTTP de fixture dentro del test (JWT RS256 firmados con una clave generada en el momento) o `fetch` simulado. No hay cuentas reales, ni login, ni llamadas al despliegue, ni credenciales. **No cierra ningún gate real ni ninguna de las issues.**

## Entorno y comandos

Windows 11, Node local, PostgreSQL 16 desechable en Docker (loopback `55432`, base `g1_auth_h4_test`, esquema creado con `prisma db push`; no certifica migraciones). Contenedor eliminado al terminar.

| Comando | Resultado |
|---|---|
| `npm run lint` / `npm run build` | PASS |
| `npx jest --runInBand` (unitarias) | 19 suites, 193 PASS |
| `npm run test:e2e` sin DB | 179 PASS, 37 omitidas (suite con DB) |
| e2e auth con PostgreSQL desechable (`auth-g7`, `account-g7`, `g7-introspection`, `auth`) | 4 suites, 74 PASS |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| Barrido de patrones de secreto sobre el diff | sin coincidencias |

No ejecutados localmente: `gitleaks`, `semgrep` y SCA completo/licencias (los corre `scripts/security-check.py` en `.github/workflows/auth-h4.yml`, Linux). No hay resultado propio de SAST/secrets/DAST en este corte.

## Cobertura nueva (qué prueba cada caso)

- `src/security/auth.guard.negative.spec.ts` (JWKS simulado): `alg=none`, algoritmo no soportado, firma de otra clave, payload alterado, issuer erróneo/ausente, expirado, `exp` no numérico/ausente, `nbf` futuro, tipo `refresh`, `sub` no UUID, sin `kid`/`kid` desconocido, malformado, segmento vacío, token > 8192, HS256 sandbox deshabilitado/producción/introspección activa, JWKS caído o inválido (503, sin aceptación degradada), config ausente, esquema Authorization.
- `src/auth/g7.client.spec.ts` (`fetch` simulado): timeout/red → 503 genérico, `redirect: 'error'`, señal de timeout, URL de proveedor insegura (http fuera de loopback, credenciales, query, otros esquemas), respuesta no JSON, solo códigos del contrato (sin mensaje/detalle del proveedor), 429 con `Retry-After` acotado/numérico.
- `test/auth-g7.e2e-spec.ts` (HTTP + PostgreSQL reales, G7 fixture), bloque *F-002 QA*:
  - **MFA sin bypass:** login con MFA no emite cookie de sesión; la cookie de desafío no abre rutas privadas ni sirve como sesión; OTP sin desafío, con desafío falsificado o con cookie de sesión renombrada → 410 sin llamar al proveedor; OTP malformado (5/7 dígitos, letras, espacios, dígitos Unicode, número, vacío, null) → 400 antes del proveedor; campos extra (`mfaRequerido`, `accessToken`, `canal`) → 400; intentos agotados y timeout destruyen el desafío; un nuevo login descarta el desafío previo.
  - **JWT:** respuesta de login con access token expirado/firma alterada/tipo refresh no crea sesión; Bearer `alg=none`, expirado, firma alterada o basura → 401 en rutas protegidas.
  - **Open redirect:** `redirect`, `returnTo`, `next`, `redirect_uri`, `redirectUrl` en el login → 400 sin sesión; ningún endpoint de auth responde con `Location`; parámetros de query de redirección se ignoran.
  - **Rate limit:** 429 del proveedor → 429 con `retryAfterSeconds` acotado, sin sesión y sin detalle del proveedor.
  - **Proveedor:** timeout y HTML de proxy → 503 genérico sin sesión; credenciales inválidas → 401 sin detalle.
  - **Tokens:** respuestas `no-store`, sin token en el cuerpo, cookie `HttpOnly; SameSite=Lax; Path=/`.

## Hallazgo corregido

**Token inválido emitido por el proveedor devolvía 401 `UNAUTHENTICATED`** (`g7-session.service.ts`, `validate`). Si G7 respondía a login/OTP/refresh con un access token expirado, mal firmado o de tipo erróneo, el BFF propagaba el 401 del guard, indistinguible de credenciales inválidas, mientras otras respuestas inválidas del proveedor (p. ej. rol no cliente) daban 503. No se creaba sesión (impacto de seguridad bajo), pero el cliente mostraría «credenciales incorrectas» ante un fallo del proveedor. Ahora responde `503 AUTH_UNAVAILABLE`. Cubierto por 3 casos e2e nuevos; los 74 e2e de auth siguen en PASS.

## Límites conocidos (no son defectos corregidos aquí)

1. **No hay rate limit propio en el BFF.** Solo se reenvía el 429 de G7. Contra fuerza bruta/OTP depende del límite y bloqueo de G7 (`OTP_INTENTOS_AGOTADOS`); falta confirmarlo con G7 REAL y decidir si el BFF/borde necesita límite por IP/cuenta. Es riesgo abierto, sin aceptación.
2. **Open redirect:** el BFF no recibe ni emite URLs de retorno; la validación del «retorno seguro» (allow-list de rutas relativas) pertenece al Frontend y no está probada aquí.
3. **«No tokens en almacenamiento web»:** en el BFF se verifica que ningún cuerpo contiene tokens y que la cookie es HttpOnly. Auditar `localStorage`/`sessionStorage` requiere pruebas del Frontend (QA FE #20), no cubiertas.
4. Cookie `Secure`/`__Host-` solo se activa con `NODE_ENV=production`; no probada con HTTPS real.
5. Sin hallazgos del proveedor real: códigos de error, política de bloqueo, TTL de OTP y formato real de 429/`Retry-After` son los del contrato leído, no observados.

## Qué falta para los gates reales

- G7 REAL/sandbox autorizado: cuentas A/B y MFA, request/response sanitizados positivos, negativos y timeout (INT #29).
- BFF desplegado + URL/SHA/run CI-CD y prueba UI/API en despliegue; DAST sobre staging propio autorizado (QA #30).
- Resultados de `gitleaks`, `semgrep`, SCA/licencias del run CI de este PR, con revisión humana; los 19 avisos moderados de desarrollo heredados siguen sin aceptación (ver `SEGURIDAD-H4.md`).
- Migración `migrate deploy` (índice duplicado heredado) y G-DB.
- Revisión independiente de código y decisión sobre el límite de tasa. Hasta entonces #28–#31 permanecen abiertas.
