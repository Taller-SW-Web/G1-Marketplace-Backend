# H4 — F-001 a F-005: cuenta y sesión de Jim

Fecha: 21/10/2026 (Lima). Autor responsable: Jim Segovia. Revisor solicitado: Andrés Morales. Implementación y pruebas asistidas por Codex; revisión humana pendiente. Evidencia local con dobles de contrato, no homologación G7 ni despliegue.

## Corte de código

- Sesión/MFA: `068fbf9cec95304a405b5af0921cd8b24e4079d9`.
- Ampliación registro/recuperación/reset: `06f950f455d39de8b9920e840b18ca27c2358b97`.
- [PR BE #229](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/229), [FE #105](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/105), [SPECS #9](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/9).
- Fuentes G7: documentación `1b034d2`, backend develop `4bd7b61` / main `d51ac2e`. Consultar código no acredita qué está desplegado.

## Resultado reproducible local

Node local y PostgreSQL 16 desechable en loopback, base `g1_auth_h4_test`; proveedor HTTP firmado local y proyección de catálogo sustituida explícitamente. Sin cuentas, correos ni contraseñas reales. Guía y variables en [INTEGRACION-G7-H4](../../../INTEGRACION-G7-H4.md).

| Comando / alcance | Resultado | Límite |
|---|---|---|
| `npm run build` y `npm run typecheck` | PASS | Compilación local |
| `npm test`, antes del último ajuste de cookies/Retry-After | 147 unitarias, 169 e2e, 4 emisor mock, 6 probe: PASS | Evidencia de regresión de esa revisión local |
| `npm run test:e2e -- test/auth-g7.e2e-spec.ts test/account-g7.e2e-spec.ts`, tras ajustes finales | 26 PASS (11 sesión + 15 cuenta) | PostgreSQL real temporal; G7 simulado |
| Playwright en frontend con BFF y DB locales | 5 PASS (2 acceso/sesión + 3 cuenta); 3 cuenta repetidas tras corrección visual | Navegador completo contra fixture; no nube |
| [CI auth-session](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/39685035657) | 30 PASS en 3 suites con PostgreSQL | Incluye 26 nuevas + 4 de auth previo; usa esquema desechable |
| [CI backend Node 22/24](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/39685035628) | 147 unitarias y 158 e2e PASS; 11 e2e de DB omitidas en esta matriz | Las 11 de sesión sí corrieron en el job PostgreSQL anterior; no contar las omitidas como PASS |

### Casos de cuenta

- Registro fija MARKETPLACE y rechaza canal/returnURL/UUID/confirmación inyectados, términos falsos y teléfono inválido; 201 sólo pendiente, sin sesión ni persistencia de credenciales.
- 409 neutro y 422 de política; estado de éxito inesperado se rechaza. Política incompatible no tiene fallback.
- Recuperación conocida/desconocida obtiene el mismo 202. Rate limit conserva únicamente segundos acotados de Retry-After; no se reintenta ni se promete correo entregado.
- Reset requiere sólo token + contraseña, 204 sin cuerpo/sesión; 401/410/422 conservan significado. Sin endpoint inventado de validación previa ni identidad elegida por el cliente.
- Gates por operación y Origin ajeno rechazan antes de contactar el proveedor. El servicio de cuenta no usa el almacén de sesiones para guardar identidad, contraseña o token de recuperación.
- Sesión anónima/expirada limpia cookie obsoleta; se conservan MFA, rotación concurrente, marcador durable, fallo incierto sin replay, no resurrección tras logout, separación A/B y Bearer inválido sin fallback.

## Integración y cierre pendientes

Jim confirmó pendientes cuentas A/B y URL/revisión desplegada del BFF. G7 aún no publica registro/recuperación/reset; gates nuevos desactivados por defecto. Faltan prueba REAL web/API, verificación de correo, revocación entre dispositivos, redacción de logs de hosting, URLs legales web publicadas y revisión independiente. SAST/SCA/DAST completos no ejecutados en esta ampliación; no se certifica su gate por tests funcionales.

La migración heredada `20261018135249_npm_run_prisma_migrate` falla en base vacía por índice duplicado (`P3018/42P07`). `db push` se usó sólo en base desechable: no certifica instalación ni repara Render. Favoritos con productos conserva dependencia del adaptador G6 del responsable; no se activa identidad sandbox para sortearlo. F-020 y política por etapa de O-004 continúan pendientes.

Las issues y las tareas INT siguen abiertas; esta evidencia permite revisión de implementación local, no cierre de H4.
