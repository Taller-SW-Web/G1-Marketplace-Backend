# F-004 / F-005 — recuperación y restablecimiento: responsabilidades, errores y evidencia (BE #39, #43)

Fecha: 01/11/2026. Documento de trazabilidad y operación; **no acredita integración desplegada ni cierra ningún issue**. Asistencia de IA (Claude Code); revisión independiente de Andrés Morales pendiente.

Fuentes consultadas (estado al 01/11/2026, todos abiertos): decisión PO en [SPECS PR #14](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/14), [FE PR #111](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/111), BE [PR #243](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/243) (QA F-004) y [PR #244](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/244) (QA F-005), más [INTEGRACION-G7-H4.md](INTEGRACION-G7-H4.md) y [F001-F005-cuenta.md](evidencias/H4/jim-segovia/F001-F005-cuenta.md) en `develop`. Este documento no repite el detalle de casos de #243/#244; los enlaza por número.

## 1. Quién hace qué (decisión PO 26/10)

| Pieza | Responsable | Estado según fuentes |
|---|---|---|
| Formularios «olvidé mi contraseña» y «nueva contraseña», correo, token y su caducidad, política real, límite de tasa, revocación de sesiones | **SPA y API de G7** | Sin prueba conjunta; no verificado desde G1 |
| Referrer, analítica, redacción de query y eliminación del token en la URL de la pantalla de reset | **G7 (SPA)** | G1 no puede probarlo; pendiente de confirmación de G7 |
| Entrada desde `/login` y redirección `/recuperar-contrasena` → G7 (`NEXT_PUBLIC_G7_RECOVERY_URL`, HTTPS, sin query/fragmento) | **G1 Frontend** | FE PR #111 abierto; sin variable desplegada |
| Rutas heredadas `/restablecer-contrasena` ya no procesan enlaces; el proxy elimina parámetros | **G1 Frontend** | FE PR #111, prueba local |
| BFF `POST /api/v1/password/recuperar` y `.../restablecer`, `GET .../password/politica`, `GET .../auth/capabilities` | **G1 Backend** | En `develop` con compuerta apagada; QA local en #243/#244 |
| Retorno fijo G7 → `/login` de G1 y mecanismo de identificación del canal | **G7** (configura) / G1 (destino) | Pendiente de G7; no hay callback ni parámetro inventado |

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

- Mantener `G7_REGISTRATION_ENABLED=false` y `G7_RECOVERY_ENABLED=false` (valor de `.env.example`) hasta confirmar implementación y prueba conjunta con G7. `capabilities` refleja sólo configuración, no disponibilidad de G7.
- Orden de activación sugerido: (1) G7 publica y confirma contrato, política y límite de tasa; (2) configurar `NEXT_PUBLIC_G7_RECOVERY_URL` antes del build del FE y `G7_RECOVERY_ENABLED=true` en el BFF; (3) prueba autorizada conjunta; (4) revisar redacción de query/analítica en hosting y G7.
- Diagnóstico: `503 AUTH_OPERATION_UNAVAILABLE` = compuerta apagada; `503 AUTH_UNAVAILABLE` = G7 no disponible o respuesta fuera de contrato (el BFF no distingue causas al cliente por diseño); `403` = Origin no coincide con `G1_WEB_ORIGIN`. No registrar correo, token ni contraseña en logs de plataforma (el correo y el token viajan en el cuerpo, no en la URL).
- El BFF no limita la tasa por sí mismo; depende del `429` de G7 (decisión abierta).

## 4. Matriz de evidencia

| Afirmación | Local con dobles | Real / desplegado |
|---|---|---|
| BFF no crea sesión ni filtra token/clave/correo; 202 uniforme; errores neutros | Sí: #243 (38 casos) y #244 (18 casos), CI de cada PR | No |
| Enlace G1 → G7, redirección, limpieza de rutas heredadas | Sí: FE #111 (componentes, Playwright, Next local 307/200) | No: variable no desplegada, sin G7 real |
| Recuperación/reset reales de G7 (correo, token de un solo uso, política, límites, revocación) | No | Pendiente; sólo hay constancia previa de login/refresh/logout en [INTEGRACION-G7-H4.md](INTEGRACION-G7-H4.md); G7 no publicaba recuperación/reset en la fuente consultada |
| Retorno G7 → `/login`, referrer y analítica del SPA | No | Pendiente de G7 |
| SAST/secrets (Semgrep, gitleaks), DAST | No ejecutados localmente | CI de cada PR para SAST/secrets; DAST pendiente |
| Revisión independiente | — | Pendiente |

## 5. Huecos de trazabilidad detectados

1. [INTEGRACION-G7-H4.md](INTEGRACION-G7-H4.md) (sección «Registro y recuperación…») aún dice que la web G1 elimina el token de URL/historial y que la UI espera el `429`; tras la decisión PO y FE #111, la pantalla de reset es de G7 y G1 sólo redirige. Actualizar esa sección cuando FE #111 se fusione (no se edita aquí para no divergir de PRs abiertos).
2. Los PRs de especificación y FE siguen abiertos: hasta fusionarse, esta matriz describe propuestas, no fuentes vigentes.
3. Enlaces Figma y decisiones resueltas de F-004/F-005: no verificados en esta revisión; deben confirmarse en SPECS tras PR #14.
4. Sin evidencia de G7 real, INT (#37, #41) y QA de despliegue (#38, #42) siguen bloqueados; esta documentación no los desbloquea.

## 6. Cierre de #39 y #43

Quedan abiertos hasta: fusión de SPECS #14, FE #111, BE #243/#244; actualización de la sección desfasada; prueba conjunta con G7 y revisión independiente.
