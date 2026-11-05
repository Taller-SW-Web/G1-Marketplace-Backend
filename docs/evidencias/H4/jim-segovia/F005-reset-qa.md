# F-005 restablecer contraseña — evidencia local QA/seguridad BFF (BE #40, #41, #42)

Fecha: 30/10/2026. Rama `test/jim-f005-qa-20261030` sobre `origin/develop`. Revisor: `andreus710`, pendiente. **Evidencia local con doble de G7; no cierra issues ni gates.**

## Decisión de alcance (SPECS PR #14)

El formulario final de recuperación/restablecimiento es la SPA de G7; G1 conserva la entrada, el BFF (`POST /api/v1/password/restablecer`), la integración y el retorno a su login. Por tanto estas pruebas cubren sólo el adaptador BFF de G1.

## Mock/local vs real

| Elemento | Naturaleza |
|---|---|
| Respuestas de `password/restablecer` | Doble HTTP en el test que reproduce el contrato documentado (204, 401 `TOKEN_RECUPERACION_INVALIDO`, 410 `TOKEN_RECUPERACION_EXPIRADO`, 422 `POLITICA_INCUMPLIDA`, 429). **No es G7 real.** |
| App Nest, validación, filtros, `configureApp`, cliente HTTP, gate de origen | Reales, en proceso. |
| Captura de logs | `stdout/stderr` durante el test, con un canario que prueba que la captura funciona. |

No se usaron cuentas, secretos reales, correos reales ni despliegues. Los token/contraseña son aleatorios por ejecución.

## Cambio de código

`AccountService.reset` ahora restringe lo que llega al cliente al contrato de reset: 401→`TOKEN_RECUPERACION_INVALIDO` (un 401 con código desconocido o de login ya no sale como `CREDENCIALES_INVALIDAS`), y un 410/422 con código ajeno (p. ej. `OTP_EXPIRADO`) se trata como `AUTH_UNAVAILABLE` 503 en lugar de reenviarlo.

## Casos (`test/password-reset-g7.e2e-spec.ts`, 18)

- 204 vacío, sin `Set-Cookie`, sin sesión implícita (el almacén de sesiones nunca se toca, ni con cookie vieja); la cookie y el Origin del navegador no viajan a G7; cuerpo a G7 = sólo `token` + `nuevaContrasena`.
- Token usado/inválido (401), vencido (410) y política (422): sólo `code` + `message` fijo, sin detalle, UUID ni correo del proveedor, aunque el doble los eco.
- El BFF no decide por su cuenta si un token está usado: refleja la respuesta del proveedor en cada llamada.
- Falla cerrada: código desconocido, 500/502 con secretos en el cuerpo, 200 con cuerpo, 202, redirección y timeout → no confirman el reset.
- 429: sólo `retryAfterSeconds` numérico acotado.
- 400 de validación (faltantes, extras, tipos, longitud) sin eco de token/contraseña y sin llamar a G7; token sólo en el cuerpo (no en query; sin GET).
- Origen ausente/ajeno/cross-site y gate apagado → rechazo antes de contactar G7. `Cache-Control: no-store, private` en éxito y errores.
- Token y contraseña ausentes de respuestas, cabeceras y logs en todos los casos.

## Resultados

Typecheck y build: PASS. Unitarias 154 PASS. E2E 213 PASS (15 suites; con Postgres 16 desechable en Docker para `auth-g7`). `npm audit --omit=dev`: 0 vulnerabilidades. El workflow `auth-h4.yml` incluye ahora este spec (Semgrep/gitleaks se ejecutan en CI, no localmente).

## Límites y bloqueos (sin inventar evidencia)

- **Referrer y analítica** del formulario con el token en la URL pertenecen a la SPA de G7; este PR no los prueba ni cambia G7. Pendiente: que G7 confirme `Referrer-Policy`, que el token no llegue a analítica/logs y que se elimine de la URL tras cargar.
- Sin G7 real no hay prueba de: consumo único real del token, política real, revocación de sesiones del usuario ni correo. Un `204` por API no acredita el recorrido de navegador.
- G1 no limpia su cookie local al restablecer: el `204` no trae identidad. La sesión local de ese usuario queda invalidada por la revocación de G7 en el siguiente refresh/introspección (sin introspección, un JWT de acceso vivo dura hasta `exp`). No verificado contra G7 real.
- Si G7 devuelve para "token usado" un código distinto de `TOKEN_RECUPERACION_INVALIDO` con 401/410, el BFF lo convertirá en 401 genérico/503; confirmar el código real con G7.
- INT #41 sigue bloqueado por G-AUTH; QA #42 requiere DAST/entorno desplegado, scans en CI y revisión independiente.

Uso de IA: Claude generó cambios y pruebas; validación humana pendiente.
