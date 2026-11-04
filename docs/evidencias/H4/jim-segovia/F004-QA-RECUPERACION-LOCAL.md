# F-004 — QA local del BFF de recuperación (BE #36, #37, #38)

Fecha: 30/10/2026. Rama `test/jim-f004-qa-20261030` sobre `origin/develop`. Responsable: Jim Segovia; revisor solicitado: `andreus710`. Asistencia de IA (Claude Code); revisión independiente y aceptación humana **pendientes**.

> **Evidencia LOCAL con un doble HTTP de G7.** No se usaron cuentas, correos, secretos ni despliegues. Nada de esto prueba el comportamiento, el límite de tasa, la latencia ni el envío de correo del G7 REAL. **No cierra #36, #37 ni #38.**

## Alcance según SPECS PR #14 (decisión PO 26/10)

El formulario final de recuperación/restablecimiento es la SPA de G7. G1 conserva entrada, BFF API, integración y retorno a su login. Este PR prueba solo el **adaptador BFF** `POST /api/v1/password/recuperar` (y, de paso, que `restablecer` no filtre token/contraseña). El recorrido de navegador G1→G7→G1 no está cubierto: un 202 por API no lo acredita.

## Qué se ejecutó

Entorno: Windows, Node local, Nest con `configureApp` real (ValidationPipe, filtros, CORS, `Cache-Control`), `AccountController/Service`, `G7Client` real y un servidor HTTP loopback que hace de G7. Sin base de datos.

| Comando | Resultado |
|---|---|
| `npx jest --config ./test/jest-e2e.json test/recovery-qa.e2e-spec.ts` | 38 PASS |
| `npx jest --runInBand` (unitarias) | 17 suites, 154 PASS |
| `npm run test:e2e` | 214 PASS, 13 omitidas (las que requieren PostgreSQL) |
| `npm run lint` / `npm run build` | PASS |
| `npm audit --omit=dev` | 0 vulnerabilidades |

No ejecutados localmente: `gitleaks`, `semgrep` (corren en CI, `auth-h4.yml`); DAST.

## Casos (test/recovery-qa.e2e-spec.ts)

- **202 uniforme / antienumeración:** correo conocido y desconocido producen estado, cuerpo vacío y cabeceras idénticos; al proveedor solo se reenvía `{correo}`; sin cookies. Respuestas inesperadas del proveedor (200 con indicador «enviado», 400, 401, 404, 500 con eco) se reducen a un 503 genérico idéntico para ambos correos y sin eco del correo ni del texto del proveedor.
- **Formato inválido:** vacío, sin `@`, número, array, objeto (`$ne`), `null`, > 254, con espacios, campos extra (`returnUrl`, `redirect`), cuerpo array/texto → 400 sin llamar a G7, sin cookie ni `Location`. La validación es local, por lo que no depende de la existencia de la cuenta. El 400 no repite el valor enviado; JSON malformado, `text/plain` y cuerpo grande tampoco lo reflejan.
- **Origen y compuerta:** sin `Origin`, foráneo, hermano (`…evil.test`) o `null` → 403 antes de G7; con `G7_RECOVERY_ENABLED=false` → 503 `AUTH_OPERATION_UNAVAILABLE` sin llamada; GET → 404.
- **429 neutro:** `{code: DEMASIADAS_SOLICITUDES, message, retryAfterSeconds}` con intervalo entero acotado; si `Retry-After` es fecha o inválido, se omite; sin IP/correo/texto del proveedor; sin reintento automático.
- **Timeout:** con G7 sin responder, 503 `AUTH_UNAVAILABLE` genérico dentro del `HTTP_TIMEOUT_MS`, una sola llamada, idéntico para correo conocido y desconocido.
- **Latencia:** con retardo constante del doble, la mediana BFF conocido vs. desconocido difiere < 40 ms en 15 pares. Solo acota sesgo introducido por el BFF (no consulta cuentas ni almacena nada: el store se verifica sin uso).
- **Logs:** se capturan `Logger` de Nest (estático e instancia), `console.*` y `stdout/stderr`; correo (éxito, 400, 500 del proveedor, timeout), token y nueva contraseña de `restablecer` no aparecen. **Control positivo:** al plantar temporalmente un `console.warn` con el correo en el servicio, 7 casos fallaron; se revirtió y no está en el PR.

## Hallazgos

1. **Corregido:** `AccountService.recover` reenviaba un 400 `VALIDACION` del proveedor (y un 401 desconocido salía como `CREDENCIALES_INVALIDAS`). Si G7 variara esas respuestas por cuenta, serían un oráculo de enumeración. El contrato F-004 solo define `202` y `429`, y el formato ya se valida en el DTO local, así que ahora cualquier error del proveedor distinto de 429 se responde como `503 AUTH_UNAVAILABLE` neutro e idéntico. 202 uniforme y 429 acotado no cambian. Solo afecta a `POST /password/recuperar`; registro, restablecer y login no se tocaron. Cubierto por 3 casos nuevos (400, 400/401/404/500 con cuerpo único, y proveedor que da 400 solo a correos no registrados).
2. **Residual (no eliminable en el BFF):** si G7 REAL respondiera 202 a unos correos y un error a otros, el cliente vería 202 vs 503. Solo G7 REAL puede descartarlo (ver bloqueos).
3. Los logs de acceso HTTP de la plataforma/proxy de despliegue no se pueden inspeccionar localmente (el correo viaja en el cuerpo, no en la URL).
4. No hay límite de tasa propio en el BFF; depende por completo del 429 de G7. Decisión abierta, igual que en F-002.
5. Los mensajes del 400 de ValidationPipe nombran el campo (`correo`) pero no el valor.

## Bloqueos que dependen de G7 / entorno (sin evidencia inventada)

- Contrato REAL: confirmación de 202 incondicional, formato y valor de `Retry-After`, política de límite de tasa publicada, comportamiento con correo inexistente, y paridad de latencia (envío de correo asíncrono o no).
- Entrega real del enlace/correo y su caducidad: prueba autorizada conjunta con G7 (INT #37); no se hizo ninguna prueba de correo.
- Retorno fijo G7 → `/login` de G1 y mecanismo de canal: pendientes de G7.
- Desplegado: BFF con `G7_RECOVERY_ENABLED` y G7 real, DAST en staging autorizado y revisión de logs de plataforma (QA #38), scans SAST/SCA/secrets del CI de este PR con revisión humana.
- Revisión independiente. Hasta entonces #36–#38 permanecen abiertas.
