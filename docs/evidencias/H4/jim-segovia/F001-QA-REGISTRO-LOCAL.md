# F-001 — QA local del BFF de registro (BE #24)

Fecha: 01/11/2026. Rama `test/jim-f001-qa-20261101` sobre `origin/develop`. Revisor solicitado: `andreus710`. Asistencia de IA (Claude Code); revisión independiente pendiente.

> **Evidencia LOCAL con un doble HTTP de G7.** Sin cuentas, correos ni secretos reales. No prueba el comportamiento de G7 REAL (política de contraseña, duplicados, correo de verificación). **No cierra #24.**

## Alcance
`POST /api/v1/auth/registro` contra SPECS `contrato-api/F-001-registrar-cliente.md`: `canalOrigen=MARKETPLACE` fijado por el BFF, respuesta `201 {id, estado:PENDIENTE_VERIFICACION}`, errores neutros, sin persistir contraseña, sin sesión implícita, apagado por defecto (`G7_REGISTRATION_ENABLED`). El flujo de verificación de correo y el destino `/login` son de Seguridad y no se prueban aquí.

## Ejecución
`test/registration-qa.e2e-spec.ts` (45 casos; pipeline real con `configureApp`, `AccountService`, `G7Client`, doble G7 loopback, sin BD) más `account-g7.e2e-spec.ts` existente: 60 PASS. Unitarias 154 PASS; `test:e2e` 224 PASS (13 omitidas que requieren PostgreSQL); lint y build PASS. gitleaks/semgrep corren en CI, no localmente.

Casos: canal fijo y campos exactos reenviados (nombres recortados); canal/confirmación/id/URL/roles/estado enviados por el cliente → 400 sin llamar a G7; 18 validaciones locales (correo, contraseña vacía/larga, nombres, celular, `aceptaTerminos` solo `true` booleano); JSON malformado sin eco; `Origin` exacto; fail closed con registro apagado o valores no `'true'`; sin `Set-Cookie` y cookie previa intacta; 201 con tokens/enlace del proveedor no se reenvía; 409/422/400 solo con código del contrato (sin correo ni contraseña); 409 con código desconocido → 503 neutro; 500/timeout → 503 genérico sin reintento; almacenamiento de sesión nunca tocado; ni contraseña, correo ni tokens en respuestas ni logs (Logger, console).

## Hallazgo corregido
La validación del `id` devuelto por G7 usaba `/^[0-9a-f-]{36}$/i`, que aceptaba cadenas inválidas como 36 guiones. Ahora exige formato UUID; si no, 503. Único cambio de producción (`src/auth/account.service.ts`).

## Límites / pendiente de G7 y entorno
- `409 CORREO_NO_DISPONIBLE` revela por contrato que el correo existe; la neutralidad se limita al mensaje. Cualquier mitigación de enumeración (respuesta uniforme) requiere decisión con Seguridad.
- Sin límite de tasa propio en registro; depende de G7. Sin CAPTCHA/anti-automatización definidos.
- Política de contraseña real, duplicados, envío y caducidad del correo de verificación, y enlaces de términos/privacidad (`G1_TERMS_URL`, `G1_PRIVACY_URL`): no probados, pendientes de G7/PO.
- Sin pruebas en despliegue, DAST ni revisión independiente. #24 permanece abierta.
