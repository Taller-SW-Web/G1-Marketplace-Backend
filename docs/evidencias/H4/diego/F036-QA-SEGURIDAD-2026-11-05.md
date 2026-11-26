# F-036 — QA seguridad / DevSecOps

Fecha: 05/11/2026. Issue: [#178](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/178). PR: [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). Responsable: Diego Espinoza. Revisor pendiente: Fernando Saire (`saire22`).

## Alcance y corte

El HEAD del PR comprobado antes de este incremento documental fue `46a2bd0b2cdf0bfaaa34b592e783b54439915072`. Sus workflows Backend PR validation, CI-CD, sesión G7 y verificación aislada terminaron correctamente. El job de deploy fue omitido por tratarse de un pull request.

Este reporte actualiza SCA y registra un sondeo dinámico no destructivo del BFF público. La URL pública no expone ID/SHA de despliegue, por lo que el sondeo **no se atribuye al HEAD del PR** y no cierra el gate de despliegue.

## Negativos cubiertos por pruebas del PR

- Sesión ausente, MFA incompleto, sesión expirada, logout y token revocado.
- Bearer forjado e intento de sobreescribir la sesión compartida.
- `customerId` inyectado en body o query; se rechaza antes de consultar G6 o persistir.
- Origen ausente/ajeno y CSRF inválido.
- Producto inactivo/inexistente y caída de G6 sin escritura.
- Aislamiento A/B y ausencia de filas en solicitudes rechazadas.
- JSON malformado sin eco del contenido enviado.

Las suites relevantes son `test/auth-g7.e2e-spec.ts`, `test/wishlist.e2e-spec.ts` y `test/wishlist.integration-spec.ts`. G7/G6 son proveedores controlados; PostgreSQL 16 es temporal y propio de la ejecución.

## SCA del lockfile vigente

Comandos ejecutados el 05/11/2026 contra el lockfile del PR:

| Comando | Resultado |
|---|---|
| `npm audit --json --omit=dev` | 142 dependencias de producción; **0 vulnerabilidades** |
| `npm audit --json` | **4 bajas, 17 moderadas, 0 altas, 0 críticas** |

Los 21 hallazgos completos pertenecen a herramientas de desarrollo y sus transitivas (`jest`, `@jest/*`, `@nestjs/cli`, `glob`, `minimatch`, `deepmerge` y relacionadas). Las correcciones propuestas incluyen cambios mayores o un downgrade mayor de Jest, por lo que no se aplicó `audit fix --force`. No existe hallazgo runtime ni alto/crítico abierto en este corte; la aceptación de las moderadas de desarrollo continúa pendiente de revisión independiente.

## Sondeo dinámico del BFF público

Destino observado: `https://g1-marketplace-backend.onrender.com`. Fecha/hora del servidor: alrededor de `2026-11-05T18:07:45Z`. Se enviaron seis solicitudes sin credenciales, sin cookies y sin una mutación válida. Los cuerpos se limitaron a fixtures sintéticas.

| Caso | Resultado observado |
|---|---|
| `GET /live` | `200`, servicio `UP` |
| `GET /ready` | `200`, entorno `production`, base conectada |
| `GET /api/v1/wishlist` anónimo | `401 UNAUTHORIZED`, `Cache-Control: no-store, private` |
| `POST /api/v1/wishlist/items` anónimo con `customerId` sintético y origen ajeno | `401 UNAUTHORIZED`, sin sesión que permita llegar a persistencia |
| `POST` con JSON malformado | `400 INVALID_REQUEST`, mensaje neutro; no reflejó el fragmento enviado |
| `TRACE /api/v1/wishlist` | `405` |

Los casos de aplicación devolvieron `X-Request-Id`. En la muestra no se observaron `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` ni `Content-Security-Policy`; debe confirmarse si esos encabezados pertenecen al proxy/frontend o si corresponde agregarlos al BFF. Su ausencia en esta muestra no constituye por sí sola un hallazgo alto/crítico.

## Hallazgos y límites

1. **Bloqueo de trazabilidad:** no hay endpoint/metadato que relacione el despliegue público con un SHA. No se puede afirmar que el destino ejecuta `46a2bd0`.
2. **Prueba autenticada pendiente:** no se proporcionaron cuentas/cookies A/B ni producto G6 inactivo autorizados para este corte. No se intentó obtenerlos ni reutilizar secretos.
3. **DAST dirigido, no escaneo exhaustivo:** el sondeo cubre autenticación anónima, sanitización, método TRACE y cabeceras. No sustituye un baseline automatizado de staging ni prueba rutas autenticadas.
4. **SCA de desarrollo:** las 17 moderadas y 4 bajas requieren decisión del revisor; runtime permanece limpio.

## Pendientes para cerrar #178

- Publicar o identificar un deployment del SHA candidato y repetir el sondeo sobre ese destino.
- Ejecutar con credenciales autorizadas los casos A/B, `customerId` manipulado, sesión revocada y producto G6 no elegible; verificar cero escrituras.
- Resolver o aceptar formalmente los hallazgos SCA de desarrollo y decidir el tratamiento de cabeceras.
- Adjuntar revisión independiente, hallazgos y retest.

## Retest previo a revisión — 05/11/2026

Con el PR #239 en `fccf4b4d6093b90145e7bf8e091b0b5535c11768` se reejecutaron los controles locales compartidos con F-038:

- `test/wishlist.e2e-spec.ts`: **31/31 PASS**.
- `wishlist.service.spec.ts` y `wishlist-read.service.spec.ts`: **10/10 PASS**.
- `npm run typecheck`: **PASS**.
- SCA runtime: **0**; árbol completo: **4 bajas, 17 moderadas, 0 altas/críticas**.
- Gitleaks 8.30.1 sobre fuente y 175 commits: **sin secretos**.

Los jobs vigentes del PR (Backend Node 22/24, CI-CD, sesión G7 y verificación aislada) estaban verdes antes de este incremento documental. Con esta evidencia #178 queda preparada para solicitar revisión independiente, conservando explícitamente los pendientes de deployment identificado, cuentas A/B, producto G6 no elegible, DAST autorizado y aceptación de riesgos.

## Cruce con evidencia OPS #206

La evidencia publicada por OPS en [#206](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/206#issuecomment-6637463557) aporta los siguientes controles transversales:

- Gitleaks y Semgrep concluyeron sin hallazgos bloqueantes en el corte evaluado por OPS.
- SCA de producción concluyó con cero vulnerabilidades.
- Los hallazgos moderados de tooling de desarrollo fueron documentados y aceptados por su responsable sin aplicar cambios mayores forzados.
- Se declaró explícitamente que ZAP/Burp o fuzzing intrusivo no deben ejecutarse contra Render productivo; esas pruebas se limitan a contenedores locales o staging aislado.

Esta referencia fortalece la justificación de riesgo y explica por qué el sondeo público de esta evidencia fue deliberadamente seguro. No reemplaza la aprobación independiente: #206 continúa abierta y el inventario exacto de SCA de este HEAD (4 bajas y 17 moderadas de desarrollo) debe ser confirmado por el revisor.

Con ello, los bloqueos restantes de #178 quedan acotados a: identificar el SHA/ID del deployment candidato; disponer por canal seguro de cuentas A/B y un producto G6 no elegible; ejecutar el DAST autenticado en staging aislado autorizado; y obtener la aprobación independiente de #178 y de la aceptación de riesgo aplicable al HEAD.
