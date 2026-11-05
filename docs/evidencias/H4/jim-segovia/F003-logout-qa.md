# F-003 logout — evidencia local QA/seguridad (BE #32, #33, #34, #35)

Fecha: 30/10/2026. Rama `test/jim-f003-qa-20261030` sobre `origin/develop` (`cd0b93a`). Revisor: `andreus710`, pendiente. **Esta evidencia es local con dobles; no cierra ningún issue ni gate.**

## Qué es mock/local y qué es real

| Elemento | Naturaleza |
|---|---|
| G7 (`login`, `refresh`, `logout`, introspección, JWKS) | Doble HTTP en el propio test, JWT RS256 firmados con clave efímera. **No es G7 real.** |
| Catálogo de productos (wishlist) | Sustituido en el test. |
| PostgreSQL 16 (Docker, loopback, base desechable) | Real, local, esquema por `prisma db push` (no certifica `migrate deploy`). |
| HTTP Nest, guards, middleware, cifrado de sesión | Reales, en proceso. |

No se usaron credenciales ni se hizo login contra ningún despliegue.

## Cambio de código (bug real)

`G7SessionService.logout` usaba `cookie()`, que devuelve `undefined` si llegan varias cookies `g1_session`. Con cabecera duplicada respondía 200 `remoteRevocationPending:false` sin borrar la sesión del servidor ni revocar el refresh. Ahora revoca cada valor enviado (sesión y desafío) y agrega `remoteRevocationPending` si alguno falla o estaba en refresh.

## Pruebas nuevas (`test/auth-g7.e2e-spec.ts`, 5 casos)

- Revocación del refresh en el doble, sesión posterior anónima, `refresh`/wishlist 401 con la cookie vieja, sin llamadas de refresh, `Cache-Control: no-store, private`, cookies expiradas, sin refresh en cuerpo/cabeceras; logout repetido con cookie vieja o sin cookie (idempotente, sin llamar a G7).
- Wishlist persistida intacta tras logout; la sesión de otra cuenta no se afecta; cambio A→B sólo ve datos de B.
- CSRF (transporte cookie): sin Origin, `null`, `Sec-Fetch-Site: cross-site`, cuerpo con token, cuerpo no vacío, GET → rechazados sin destruir la sesión ni llamar a G7; un Bearer sin cookie no revoca nada.
- Logout con refresh en curso: `remoteRevocationPending:true`, sesión no resucitada.
- Cookies duplicadas (regresión del bug anterior).

Ya cubiertos antes: fallo remoto de logout con cierre local, expiración, introspección revocada.

## Resultados (Windows, Node local, Postgres 16 Docker)

- `npm run lint`/typecheck y `npm run build`: PASS.
- `npm run test:unit`: 154 PASS. `npm run test:e2e`: 197 PASS (incluye 18 de `auth-g7`). `test:mock-auth`: 4 PASS. `test:g6:probe`: 6 PASS (herramientas con dobles).
- `npm audit --omit=dev` (SCA): 0 vulnerabilidades.
- **No ejecutados:** Semgrep y gitleaks (`scripts/security-check.py`) no están instalados en esta máquina; los corre el workflow `auth-h4.yml` en el PR. DAST no aplica sin despliegue autorizado.

## Qué falta para los gates reales

- #33 INT: cierre documentado de G-AUTH, credenciales/sandbox autorizados y request/response REALES de logout (positivo/negativo/timeout). Hay constancia previa en `INTEGRACION-G7-H4.md` (21–23/10), no repetida aquí.
- #34 QA: SAST/secrets en CI, DAST y negativos en entorno desplegado; comprobación FE de caches/estado del navegador (QA-001 en Frontend, #22); no se probó CSRF para transporte Bearer porque el BFF sólo usa cookie.
- #32 BE / #35 DOC: URLs/SHAs de despliegue, revisión independiente y aprobación. Límite conocido: un JWT de acceso ya emitido sigue válido hasta `exp` salvo que la introspección esté habilitada.
- `prisma migrate deploy` sobre base vacía falló antes por migración heredada (issue #204 tiene fix en develop; no reverificado aquí).

Uso de IA: Claude generó cambios y pruebas; validación humana pendiente.
