# G7 H4 — cuenta y sesión del BFF

Responsable: Jim Segovia. Revisor: Andrés Morales. Estado: implementación local F-001–F-005; integración REAL y despliegue pendientes. No activar por la existencia de esta guía.

## Fuentes y responsabilidades

- G1 SPECS: propuesta `docs/s2-auth-sesion-g7`, contratos F-002/F-003.
- G7 documentación: `1b034d2b1db0a19bb5c12c1c5426c797f47864b5`, OpenAPI v1.1.0 y `docs/integracion/hito-4-marketplace.md`.
- Base G7 contrastada: develop `4bd7b61`, main `d51ac2e`. Revalidación del 21/10: develop `813b8099a59974c172d95a0b45b23d125e58caa6`, main continúa `d51ac2e`. Se contrastaron DTO, login/MFA, refresh de un uso y logout; consultar código no prueba el despliegue.
- Contacto técnico G7: David Morales Brenis. Contratos/scopes: Sergio. Cuentas A/B por canal privado.

## Preparación del entorno REAL

1. Confirmar revisión desplegada G7, cuentas A/B y horario conjunto. G1 debe confirmar URLs/SHAs del frontend y BFF.
2. Resolver la migración heredada `20261018135249_npm_run_prisma_migrate`: en una base nueva falla con P3018/42P07 por `cart_items_product_id_idx` duplicado. No se corrigió ni se modificó una base existente. La nueva migración `20261021000100_auth_sessions` queda después de ese bloqueo.
3. Configurar en el gestor privado del BFF: `AUTH_ENABLED=true`, `G7_API_URL=https://g7-auth-service.onrender.com/api/v1`, `G1_WEB_ORIGIN` igual al origen web HTTPS, `AUTH_SESSION_KEY` con 32 bytes aleatorios en base64. No commitear la clave. No compartirla con frontend. `HTTP_TIMEOUT_MS` máximo 5000.
4. Desactivar `H3_AUTH_MOCK` y `H3_SANDBOX_ENABLED`. Quitar los valores locales de `AUTH_ISSUER`/`AUTH_JWKS_URL`; se derivan de G7_API_URL o fijar exactamente issuer/JWKS acordados. `USE_MOCKS` no concede identidad.
5. Frontend: `G1_AUTH_ENABLED=true`, `G1_WEB_ORIGIN` idéntico y `MARKETPLACE_API_URL` al BFF HTTPS. Desactivar sandbox web. La configuración se lee al servir la página, sin congelarla en el build.
6. Aplicar las migraciones revisadas por el equipo; verificar DB y liveness. Nunca usar `db push` como sustituto de migraciones de despliegue.

## Sesiones

El navegador sólo recibe cookies opacas HttpOnly. PostgreSQL guarda SHA-256 del identificador, payload cifrado AES-256-GCM vinculado a esa fila y TTL. Tokens, nombres y UUID de sesión están dentro del cifrado; no se guardan contraseñas. Sesión máxima siete días desde el login, desafío máximo cinco minutos.

El bloqueo de fila protege la transición a `refreshing`. Ese marcador se confirma antes de contactar G7. Otra instancia espera el resultado; si la instancia muere, el marcador vencido invalida la sesión y nunca reproduce el refresh anterior. Un timeout o respuesta incierta invalida localmente; no se reintenta automáticamente. Logout concurrente no permite resucitar una sesión. Cambiar la clave de cifrado invalida las sesiones existentes.

Operación debe purgar filas con `expires_at <= now()` de `auth_sessions` en el mantenimiento acordado. Las filas vencidas no autorizan acceso aunque todavía no se hayan purgado. Incluir permisos mínimos de DB, respaldo/custodia y rotación de la clave en el despliegue.

`POST /api/v1/auth/logout` devuelve cierre local y `remoteRevocationPending`. Si G7 no responde, el cliente cierra localmente e informa que no confirmó revocación remota. No promete invalidación inmediata de JWT ya emitidos. La indisponibilidad de DB devuelve error y no anuncia cierre confirmado.

## Registro y recuperación preparados, aún no publicados por G7

Mantener `G7_REGISTRATION_ENABLED=false` y `G7_RECOVERY_ENABLED=false`. Sólo activar cada bloque tras confirmar implementación, revisión desplegada y prueba conjunta. `GET /api/v1/auth/capabilities` informa capacidades habilitadas por configuración; no realiza una prueba de disponibilidad del proveedor.

- Registro fija `canalOrigen=MARKETPLACE` en el BFF. El navegador no puede enviar canal, confirmación de contraseña, UUID ni URL de retorno. `201/PENDIENTE_VERIFICACION` no crea sesión. Verificación y reenvío pertenecen a la pantalla de G7, con regreso `/login` configurado por ellos; falta probar enlaces válido/vencido/usado.
- `GET /api/v1/password/politica` transporta únicamente campos públicos validados. Si falla o cambia el contrato, no se sustituyen los requisitos por valores supuestos.
- Recuperación devuelve `202` uniforme. `429` conserva, si existe, el `Retry-After` numérico acotado; Next lo expone y la UI espera sin reintento automático. El límite y los correos pertenecen a G7; el fixture no certifica latencia ni entrega real.
- Restablecimiento envía sólo token y contraseña nueva y requiere `204` sin cuerpo. No crea sesión ni almacena el enlace. G7 consume el token y revoca las sesiones del usuario afectado. El `204` no proporciona UUID: G1 no inventa una identidad para borrar sesiones de otros dispositivos. Homologar con G7 la revocación efectiva de JWT emitidos y la continuidad en varios dispositivos.
- La web elimina el token de URL/historial y aplica no-referrer. Configurar por separado redacción de query en hosting/proxies/analítica; el código local no acredita esa configuración. Publicar y configurar `G1_TERMS_URL` y `G1_PRIVACY_URL` HTTPS en frontend antes de habilitar consentimiento/registro. Los enlaces sintéticos de las pruebas no son documentos publicados.

La confirmación O-004 se implementó con foco inicial en continuar, Escape/cierre, foco de retorno y errores. La política específica durante `SUBMITTED`, recuperación de contexto y validación mobile/independiente siguen abiertas. F-002 conserva su dependencia de fusión de carrito F-020; login por sí solo no la implementa.

## Prueba REAL pendiente

### Actualización de G7 develop — 21/10/2026

`813b809` incorpora tokens de servicio/introspección y soporte interno de tokens de un uso. `LoginController` no cambió respecto de `4bd7b61`; el perfil de usuario sigue sin `aud`, mientras el servicio usa `tipo=servicio`, `aud` y `scope`. No se encontraron controladores públicos de registro, recuperación ni restablecimiento en ese corte: la mejora de tokens internos no acredita esos recorridos HTTP.

Fuente nueva: `IntegracionController`, `IntrospeccionResponse`, `IntrospeccionService` y `docs/capacidades/identidad.md` de ese SHA. `POST /auth/token` recibe formulario `grant_type=client_credentials`, `client_id`, `client_secret`; devuelve `accessToken`, `tokenType`, `expiresIn`, `scopes`. `POST /auth/introspeccion` recibe JSON `{token}` con Bearer de servicio y exige `tokens:introspeccion`; devuelve `activo` y, sólo si activo, identidad/roles/permisos/exp. Comprueba `jti`/familia vigente, estado de cuenta y roles. Esto permite preparar homologación de revocación, pero G1 todavía no consume ese endpoint ni cuenta con concesión/credencial/despliegue confirmados.

Coordinar cliente técnico propio G1, audiencia `api-seguridad` y scope mínimo con Sergio/Brenis, por canal privado. No reutilizar credenciales de Chatbot ni inferir permiso G1 por código o SQL de ejemplo; no exponer secreto ni token de servicio al navegador. Confirmar revisión desplegada y comportamiento real antes de añadir/activar introspección. G6 conserva sus scopes/audiencias independientes.

Web y API: login inválido neutro, login válido, MFA efectivo, recarga, refresh, expiración, logout repetido, fallo/timeout del proveedor y cambio de pestaña. A sólo ve sus datos, B sólo los suyos, sin sesión se rechaza, Bearer adulterado no cae a cookie válida. Rechazar selección de dueño por query/body y mutaciones con Origin externo.

Favoritos conserva su dependencia del adaptador de Productos. La lectura vacía no necesita proyección; una lista con productos requiere el adaptador de catálogo del responsable. Las pruebas locales sustituyen esa proyección de forma explícita y no acreditan integración G6. No habilitar identidad sandbox para sortear esa dependencia.

Guardar entorno, commits, casos, estado HTTP y resultados sanitizados. No guardar HAR, trazas con cuerpos de login, tokens, cookies, OTP, contraseñas ni cuentas reales en capturas/logs. Pedir revisión independiente antes de merge.

## Reproducción local aislada

Crear PostgreSQL temporal con base **g1_auth_h4_test**, sólo loopback, esquema public; usar credenciales sintéticas propias. Instalar dependencias y generar Prisma. `AUTH_TEST_DATABASE_URL` debe apuntar exclusivamente a esa base; el test rechaza otros nombres y hosts externos y borra sus filas.

Para esa base desechable y vacía: `DATABASE_URL` igual a la URL temporal, `npx prisma db push --skip-generate`; después `npm run test:e2e -- test/auth-g7.e2e-spec.ts test/auth.e2e-spec.ts`. Esto verifica esquema actual y sesiones, no la cadena histórica de migraciones. El workflow `auth-h4.yml` reproduce ese alcance en PostgreSQL 16.

Añadir `test/account-g7.e2e-spec.ts` para registro, recuperación, política y reset: proveedor HTTP local, gates apagados/encendidos, inyección, estados esperados, neutralidad y CSRF. No necesita cuentas G7 ni prueba de correos reales. [Evidencia ampliada F-001–F-005](evidencias/H4/jim-segovia/F001-F005-cuenta.md).

Demo web optativa: `G7_FIXTURE_ACK=local-only`, `NODE_ENV=test`, ejecutar `node scripts/g7-contract-fixture.mjs`; sirve sólo loopback 4012. Identidades: a/b/mfa@fixture.test, contraseña sintética `Fixture-only!123`, OTP sintético `123456`. No se envían correos. No representan cuentas de G7. Configurar BFF local 10002, web 3002 y ambos orígenes a `http://127.0.0.1:3002`; issuer/JWKS al emisor local. Usar una clave efímera y la base temporal. Web: `npm run dev -- --port 3002`; ejecutar en frontend `npx playwright test --config playwright.auth.config.ts`. No usar credenciales reales con este simulador.
