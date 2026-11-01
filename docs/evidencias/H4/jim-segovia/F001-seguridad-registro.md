# F-001 registro — QA seguridad local y trazabilidad (BE #26, #27)

Fecha: 01/11/2026. Rama `test/jim-f001-sec-20261101` sobre `origin/develop` (`cd0b93a`). Revisor: `andreus710`, pendiente. **Evidencia local con doble de G7; no cierra issues ni gates.** No toca código de producción (coordinación con #24, que edita esas rutas).

## Mock/local vs real

G7 es un doble HTTP dentro del test (`test/registration-security-g7.e2e-spec.ts`). Reales: app Nest con `configureApp`, validación, filtros, cliente HTTP, gate de origen, captura de `stdout/stderr` (con canario). **No ejecutado:** Semgrep/gitleaks (corren en CI `auth-h4.yml`, que ahora incluye el spec), DAST, G7 real, correo real, UI. No se usaron cuentas ni secretos; correo y contraseña son aleatorios por ejecución.

## Trazabilidad criterio #26 → prueba

| Criterio | Cobertura (18 casos) |
|---|---|
| Antienumeración 409 | 409 → sólo `code`+mensaje fijo, idéntico al de 422; sin detalle/UUID/correo del proveedor; 409/422 con código desconocido, 500, HTML → 503 sin eco. |
| Canal/returnURL no manipulables | `canalOrigen`, `canal`, `returnUrl`, `returnURL`, `redirectUrl`, `callbackUrl`, `estado`, `roles`, `id` → 400 sin llamar a G7; `__proto__` en JSON, query string y form-urlencoded no alteran `canalOrigen: MARKETPLACE`. |
| Política en servidor | El BFF no impone política local: reenvía verbatim (incluye espacios) y refleja 422 del proveedor; sólo límites estructurales (1–256). |
| Secretos fuera de log/storage | Contraseña y correo ausentes de respuestas, cabeceras y logs; el almacén de sesiones nunca se usa; sin `Set-Cookie`; `no-store, private`. |
| Éxito | Sólo `id`+`PENDIENTE_VERIFICACION`; descarta `accessToken`/enlaces del proveedor; respuestas de éxito malformadas → 503. |
| CSRF/gate | Origen ausente/ajeno/cross-site y gate apagado → rechazo antes de G7. 429 con `Retry-After` fuera de rango → sin pista. |

## Resultados (01/11/2026, Windows, Node local)

Spec nuevo: 18 PASS. Typecheck y build: PASS. Unitarias 154 PASS. E2E 197 PASS, 13 omitidas (`auth-g7` exige Postgres; no se levantó en esta corrida). `npm audit --omit=dev`: **1 alta** (ver abajo).

## Hallazgos y límites

1. **409 revela existencia por diseño** (`CORREO_NO_DISPONIBLE` es contrato G7; 201 vs 409 distingue). El BFF no añade señales extra, pero la antienumeración total requiere decisión de producto/G7 (p. ej. respuesta uniforme + correo). Abierto, no es regresión.
2. **SCA:** `follow-redirects` 1.16.0–1.16.1 (alta, GHSA-mrwp-f3q8-3g9p; transitiva vía `@nestjs/axios`/axios) aparece hoy en `npm audit`. Cambia `package-lock.json`, así que no se corrigió aquí; coordinar un PR de dependencias. Su explotabilidad en este BFF no se evaluó.
3. Sin prueba contra G7 real: política real, unicidad de correo, rate-limit real y envío de verificación siguen pendientes (INT bloqueado por G-AUTH). #27 (documentación) sólo queda parcialmente cubierto: falta enlazar Figma/decisiones y revisión independiente.

Uso de IA: Claude generó pruebas y documentación; validación humana pendiente.
