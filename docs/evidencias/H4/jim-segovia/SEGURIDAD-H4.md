# H4 — seguridad de cuenta y sesión

21/10/2026. Responsable Jim Segovia; revisor Andrés Morales. Codex asistió implementación/pruebas. Revisión independiente y aceptación de riesgo pendientes.

## Corte y resultado

Workflow `af788cc`, implementación cuenta `06f950f` y sesión `068fbf9`. [CI 39686635460 PASS](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/39686635460), merge de prueba `83877bfec2fce97b21ac002c5ba941c02d60bc43`, base `f821e9e`. [Resumen sanitizado](seguridad/summary.json) e [inventario](seguridad/licenses.json) del artefacto de ese run.

| Comprobación | Resultado y límite |
|---|---|
| Gitleaks 8.30.1 | Fuente, historia PR y build dist PASS, sin hallazgos; control positivo PASS |
| Semgrep 1.181.0 | 111 archivos src/scripts, cuatro reglas locales; PASS sin hallazgos/errores; control positivo PASS |
| SCA runtime | 0 avisos |
| SCA runtime/dev | 19 moderados, 0 altos/críticos; cumple umbral automático, aceptación humana pendiente |
| Licencias | Inventario 663 paquetes; no aprobación legal automática |

El run incluye 30 pruebas de auth/cuenta con PostgreSQL desechable y build/typecheck. La matriz Node22/24 valida por separado. A/B, CSRF, MFA previo a sesión, Bearer adulterado, cifrado, rotación concurrente, caída/timeout sin replay y logout: [evidencia funcional](F001-F005-cuenta.md).

## Moderados de desarrollo

Audit identifica `sprintf-js` (denegación de servicio por precisión no acotada), propagado a Jest vía argparse/js-yaml/cobertura: 19 entradas de paquetes, no 19 fallos independientes de la aplicación. No aparece en `--omit=dev` de este corte. Falta revisión de exposición del pipeline y decisión de actualización/aceptación del responsable de seguridad. No se aplicó downgrade de Jest ni `audit fix --force`; el resumen sanitizado permite revisar las dependencias.

## Pendientes

SAST cubre cuatro patrones locales, sin taint/interprocedimental ni certificación completa. El intento Windows/WSL agotó tiempo en SAST y no se presenta como aprobado; evidencia válida de scans: CI Linux. DAST en staging propio autorizado, revisión, aceptación de moderados/licencias, G7 REAL/cuentas A-B, BFF desplegado, G-DB y secretos/logs siguen pendientes. Esquema desechable no certifica migraciones. Issues QA/INT abiertas.
