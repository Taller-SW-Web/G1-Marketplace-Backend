# H4 — preparación de revocación consultada con G7

21/10/2026. Responsable Jim Segovia; revisor solicitado Andrés Morales. Código `224486b9f9e4228887c5700af350840107955e46` en [BE #229](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/229); [contrato propuesto SPECS #9](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/9). Codex asistió implementación y pruebas; aprobación humana pendiente.

Fuente contractual observada: G7 backend develop `813b8099a59974c172d95a0b45b23d125e58caa6`, `IntegracionController`, `TokenServicioResponse`, `IntrospeccionResponse` e `IntrospeccionService`. Main permanece `d51ac2e`; leer develop no acredita despliegue ni concesión de permisos a Marketplace.

## Implementado, apagado por defecto

- Cliente técnico server-only por formulario; respuesta tipada, scope requerido y expiración acotada. Credencial en configuración privada, token sólo en memoria y emisión concurrente compartida.
- Firma del JWT de persona antes de introspección; el guard compartido no acepta token de servicio como identidad de cliente. Nunca se reenvía una credencial técnica al navegador.
- Cada request protegido consulta actividad; no caché de respuestas activas ni fallback offline con proveedor caído. Las rutas públicas de cuenta y logout mantienen sus reglas.
- Cookie y Bearer directo revocados se rechazan; al recargar se borra sesión/cookie revocada. 503 transitorio no devuelve identidad ni declara logout, conserva refresh válido para recuperación posterior.
- Error de credencial, scope, formato, identidad distinta o timeout cierra el acceso de esa solicitud. No reintento automático de la consulta fallida. Los motivos de G7 no salen a la respuesta pública.
- Se conserva 503 público en favoritos en vez de convertir indisponibilidad de autenticación en 500 genérico. El refresh de usuario conserva la protección de un solo uso y su invalidación ante respuesta incierta.

## Prueba local ejecutada

Node, HTTP firmado en loopback y PostgreSQL 16 propio, base desechable `g1_auth_h4_test`. Sin cuentas ni credenciales reales; catálogo sustituido expresamente. No hubo conexión a G7 ni a DB compartida.

| Comando | Resultado |
|---|---|
| `npm run build` | PASS |
| `npm test` con `AUTH_TEST_DATABASE_URL` temporal | 148 unitarias, 189 e2e (sin omitir la suite de DB), 4 emisor mock y 6 probe: PASS |
| `npm run typecheck` | PASS |
| [CI auth-session 39689609631](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/39689609631) | 50 casos en 4 suites PASS con PostgreSQL; build/tipos y scans PASS |
| [CI matriz Node22/24 39689609649](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/39689609649) | Ambos jobs PASS; sus pruebas sin DB no sustituyen las de PostgreSQL |

[Resumen sanitizado de scans de este corte](seguridad/introspeccion-summary.json), merge de prueba `c890a996cba4f14708ae36b190e51c3db757ffb5`: Gitleaks source/historia/dist PASS, Semgrep113 archivos/cuatro reglas PASS, runtime0 avisos y total19 moderados de desarrollo pendientes de aceptación. El inventario de dependencias no cambió respecto del baseline enlazado en [SEGURIDAD-H4](SEGURIDAD-H4.md); esto no certifica seguridad completa ni riesgo aceptado.

La suite nueva `test/g7-introspection.e2e-spec.ts` contiene 18 casos: desactivado sin tráfico técnico, JWT inválido antes de credencial, anónimo sólo cuando el guard es opcional, A/B concurrentes con un grant, revocación posterior sin caché activa, expiración del grant, 401/403/503 del servicio, scope ausente, activo incompatible/UUID distinto/tipo incorrecto/exp vencido, rechazo sin retry/fallback y timeout real HTTP. La fixture comprueba form encoding, campos y uso separado del Bearer técnico; valores sólo sintéticos generados durante la ejecución.

`test/auth-g7.e2e-spec.ts` amplía a 13 casos con PostgreSQL: revocación de cookie/Bearer, recarga que elimina fila/cookie y caída temporal que rechaza acceso sin perder la sesión todavía válida. Se conservan los negativos previos de sesión/MFA/refresh y separación A/B. `auth-h4.yml` ejecuta las suites con la base temporal y los scans del mismo corte.

## Cierre pendiente

`G7_INTROSPECTION_ENABLED=false`. Cliente técnico G1 con `tokens:introspeccion`/audiencia `api-seguridad`, secretos privados y revisión desplegada aún sin confirmar; pregunta enviada a Jim sin solicitar secretos en chat. Cuentas A/B y BFF desplegado continúan pendientes según Jim. Confirmar presupuesto de latencia/disponibilidad y prueba REAL: logout/reset/cambio de estado, otra sesión del mismo usuario, A/B, scope incorrecto, proveedor caído y recuperación. No inferir que reset G7 esté publicado ni que todas las familias se revoquen por ver un 204 simulado.

No reemplaza G-DB, revisión independiente, DAST de staging, aceptación de moderados de desarrollo ni los gates de publicación de registro/recuperación. Las issues permanecen abiertas y no se hizo merge.
