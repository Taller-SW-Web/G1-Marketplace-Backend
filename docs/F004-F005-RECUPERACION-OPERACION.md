# F-004 / F-005 — recuperación y restablecimiento: responsabilidades, errores y evidencia (BE #39, #43)

Fecha: 01/11/2026. Documento de trazabilidad y operación; **no cierra ningún issue**. Incluye el resultado de la prueba real del 26/10 (API web G1 ↔ G7 desplegado) y separa lo que sigue sin probar. Asistencia de IA (Claude Code); revisión independiente de Andrés Morales pendiente.

Fuentes consultadas (estado al 01/11/2026, todos abiertos): decisión PO en [SPECS PR #14](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/14), [FE PR #111](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/111), BE [PR #243](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/243) (QA F-004) y [PR #244](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/244) (QA F-005), más el seguimiento de Jim (resultado F-004/F-005 del 26/10 y verificación del 27/10, sin datos sensibles) y [INTEGRACION-G7-H4.md](INTEGRACION-G7-H4.md) y [F001-F005-cuenta.md](evidencias/H4/jim-segovia/F001-F005-cuenta.md) en `develop`. Este documento no repite el detalle de casos de #243/#244; los enlaza por número.

## 1. Quién hace qué y estado (decisión PO 26/10)

| Pieza | Responsable | Estado según fuentes |
|---|---|---|
| Formularios «olvidé mi contraseña» y «nueva contraseña», correo, token y su caducidad, política real, límite de tasa, revocación de sesiones | **SPA y API de G7** | Recuperación y reset v1 **desplegados** en G7 (backend `7142a03`, frontend `e9cd51d`, confirmado por G7 el 26/10). Probado por la API; la SPA de extremo a extremo no |
| Referrer, analítica, redacción de query y eliminación del token en la URL de la pantalla de reset | **G7 (SPA)** | G1 no puede probarlo; pendiente de confirmación de G7 |
| Entrada desde `/login` y redirección `/recuperar-contrasena` → G7 (`NEXT_PUBLIC_G7_RECOVERY_URL`, HTTPS, sin query/fragmento) | **G1 Frontend** | FE PR #111 abierto. El 27/10 el despliegue público aún mostraba el formulario propio de G1; la entrada a la SPA G7 no está desplegada |
| Rutas heredadas `/restablecer-contrasena` ya no procesan enlaces; el proxy elimina parámetros | **G1 Frontend** | FE PR #111, prueba local |
| BFF `POST /api/v1/password/recuperar` y `.../restablecer`, `GET .../password/politica`, `GET .../auth/capabilities` | **G1 Backend** | En `develop`; en el despliegue la recuperación está **habilitada** (`capabilities.recuperacion:true` el 26/10) y ejercitada con éxito. QA local en #243/#244 |
| Retorno fijo G7 → `/login` de G1 y mecanismo de canal | **G7** (configura) / G1 (destino) | G7 aún navega a su propio `/login`; G7 dijo el 27/10 que avisará con SHA al desplegar el ajuste. Sin despliegue ni prueba |

## 2. Contrato de errores del BFF

Todas las respuestas llevan `Cache-Control: no-store, private`, sin `Set-Cookie` y sin sesión. Requieren `Origin` igual a `G1_WEB_ORIGIN` (si no, 403 antes de contactar G7) y la compuerta `G7_RECOVERY_ENABLED=true` (si no, 503 `AUTH_OPERATION_UNAVAILABLE`).

| Operación | Éxito | Errores visibles al cliente |
|---|---|---|
| `POST /password/recuperar` `{correo}` | `202` vacío, igual para cuentas conocidas y no | `400` validación local; `429 DEMASIADAS_SOLICITUDES` con `retryAfterSeconds` numérico acotado (omitido si no es entero); `503 AUTH_UNAVAILABLE` para cualquier otra respuesta, timeout o redirección (con #243) |
| `POST /password/restablecer` `{token, nuevaContrasena}` | `204` vacío | `401 TOKEN_RECUPERACION_INVALIDO` (usado o inválido, según G7); `410 TOKEN_RECUPERACION_EXPIRADO`; `422 POLITICA_INCUMPLIDA`; `429 RATE_LIMITED`; `400`; `503 AUTH_UNAVAILABLE` ante códigos fuera de contrato, 200/202 o timeout (con #244) |
| `GET /password/politica` | `200` con sólo campos públicos validados | `503` si el contrato cambia; nunca se sustituye por valores supuestos |

Los mensajes son fijos; no se reenvían textos, UUID ni correos del proveedor. El token y la contraseña viajan sólo en el cuerpo JSON del POST.

Nota de coherencia: #243 y #244 modifican `src/auth/account.service.ts` en funciones distintas (`recover` y `reset`); una simulación de fusión entre ambas no produjo conflicto.

## 3. Operación

- **Valor por defecto:** `.env.example` mantiene `G7_REGISTRATION_ENABLED=false` y `G7_RECOVERY_ENABLED=false`. **En el despliegue de G1 la recuperación está habilitada** desde la activación del 26/10 (registro sigue apagado: G7 no lo tiene desplegado). Confirmar el valor vigente en el hosting; este documento no lo verifica de forma continua. `capabilities` refleja sólo configuración, no disponibilidad de G7.
- **Disponibilidad observada:** tras la activación, la política de contraseñas mostró intermitencia (503 en BFF/web y una lectura directa a G7 agotó 30 s; un retest posterior dio 200 en G7, BFF y web). Causa no confirmada. Las operaciones reales tardaron ≈5–6 s (202 en 5,7 s; 204 en 5,3 s), superiores al `HTTP_TIMEOUT_MS` por defecto de 5000 ms de `G7Client`; como terminaron con éxito, el despliegue debe tener un valor mayor. Confirmar ese valor en el hosting (no se verificó aquí) antes de repetir la prueba.
- **Pasos pendientes para el recorrido final:** (1) desplegar FE #111 con `NEXT_PUBLIC_G7_RECOVERY_URL` antes del build; (2) G7 despliega el retorno fijo a `/login` de G1 y avisa su SHA; (3) repetir en navegador, con enlace nuevo y cuenta controlada autorizada, el recorrido G1 → SPA G7 → G1; (4) revisar redacción de query/analítica en hosting y G7.
- **Diagnóstico:** `503 AUTH_OPERATION_UNAVAILABLE` = compuerta apagada; `503 AUTH_UNAVAILABLE` = G7 no disponible, lento o respuesta fuera de contrato (no se distingue al cliente por diseño); `403` = Origin distinto de `G1_WEB_ORIGIN`. No registrar correo, token ni contraseña en logs de plataforma (viajan en el cuerpo, no en la URL).
- El BFF no limita la tasa por sí mismo; depende del `429` de G7 (decisión abierta).
- Las credenciales de las cuentas de prueba están fuera de Git (cifradas); nunca copiarlas, ni tokens ni enlaces de recuperación, a issues, PR, logs o notas.

## 4. Matriz de evidencia

| Afirmación | Local con dobles | Real (26/10, sin datos sensibles) |
|---|---|---|
| BFF no crea sesión ni filtra token/clave/correo; 202 uniforme; errores neutros | Sí: #243 (38 casos) y #244 (18 casos), CI de cada PR | — |
| Solicitud de recuperación por la web G1 → G7 | Sí (doble) | **Sí:** POST real, `202`, correo recibido (el enlace apuntó a la SPA de G7, no a un formulario de G1) |
| Restablecimiento por la API web G1 | Sí (doble) | **Sí:** `204`; login con la contraseña nueva `200` (sesión y logout `200`); con la anterior `401 CREDENCIALES_INVALIDAS`; reutilizar el token `401 TOKEN_RECUPERACION_INVALIDO`; nuevo login con la contraseña vigente `200` |
| Enlace G1 → G7, redirección, limpieza de rutas heredadas | Sí: FE #111 (componentes, Playwright, Next local 307/200) | No desplegado (27/10: aún formulario propio de G1) |
| SPA G7 de extremo a extremo y retorno G7 → G1 | No | **No probado**; G7 sigue navegando a su `/login` |
| Token vencido (`410`) | Sí (doble) | **No probado** |
| Revocación de sesiones entre dispositivos | No | **No probado** |
| Referrer y analítica del SPA | No | Pendiente de G7 |
| SAST/secrets (Semgrep, gitleaks) | CI de cada PR (no local) | — |
| DAST, QA formal, revisión independiente | — | **No hechos** |

Límite de la prueba real: una sola ejecución autorizada con cuenta controlada, vía API web G1; no es la UI de reset ni acredita latencia o disponibilidad sostenidas.

## 5. Huecos de trazabilidad detectados

1. [INTEGRACION-G7-H4.md](INTEGRACION-G7-H4.md) (sección «Registro y recuperación preparados, aún no publicados por G7») está desfasada en dos puntos: G7 ya publicó recuperación/reset v1 y G1 los activó, y la pantalla de reset es de G7 (G1 sólo redirige), no de la web G1. Actualizarla con el resultado del 26/10 cuando FE #111 se fusione (no se edita aquí para no divergir de PRs abiertos).
2. Los PRs de especificación y FE siguen abiertos: hasta fusionarse, las filas de entrada/redirección describen propuestas, no fuentes vigentes.
3. Enlaces Figma y decisiones resueltas de F-004/F-005: no verificados en esta revisión.
4. SHAs efectivamente desplegados de G1 (Render/Vercel) y traza del 503 de login del 25/10: no certificados; obtenerlos de los hostings, sin inferirlos de `develop`.
5. INT (#37, #41) y QA de despliegue (#38, #42) siguen abiertos: hay evidencia real parcial por API, pero faltan retorno/SPA, token vencido, revocación entre dispositivos, DAST y revisión.

## 6. Cierre de #39 y #43

Permanecen abiertos hasta: fusión de SPECS #14, FE #111, BE #243/#244; actualización de la sección desfasada; evidencia de retorno G7 → G1 y de los casos no probados; y revisión independiente.
