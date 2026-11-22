# H5 · DAST y QA de seguridad de Marketplace

Entorno **MOCK / aislado**. Alcance: API de Marketplace para registro, login/MFA, logout, recuperación, reset y direcciones de checkout (#26, #30, #34, #38, #42, #116). ZAP usa la imagen oficial `ghcr.io/zaproxy/zaproxy:stable` y análisis pasivo. La imagen se fija por digest en Compose. [Documentación de ZAP Baseline](https://www.zaproxy.org/docs/docker/baseline-scan/).

## Reproducir el escaneo

Desde la raíz del backend, con Docker Desktop y PowerShell 7, crea los worktrees de prueba desde las revisiones del reporte. Ejecuta desde la raíz del worktree DAST en la estructura de carpetas de G1:

```powershell
git -C ../../repositories/G1-Marketplace-Backend fetch origin pull/331/head
git -C ../../repositories/G1-Marketplace-Backend worktree add --detach ../../worktrees/be-dast-target a7733f7560449e1af9ce9f6ba28fef897414101e
git -C ../../repositories/G1-Marketplace-Frontend fetch origin develop
git -C ../../repositories/G1-Marketplace-Frontend worktree add --detach ../../worktrees/fe-dast-target 8420d42855c9894267d6f06f8474834955d9b61e

pwsh -NoProfile -File tools/dast/run.ps1 -AppSource ../be-dast-target -FrontendSource ../fe-dast-target -Contract ../../repositories/Modulo-de-Seguridad/specs/openapi.yaml
```

La evidencia de F-022 corresponde al worktree de la revisión `a7733f7560449e1af9ce9f6ba28fef897414101e` del [PR #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331). El argumento `AppSource` por omisión escanea el checkout actual. Para repetir F-022 mientras el código siga en #331 se necesita esa revisión. `Contract` debe apuntar al [OpenAPI G7 1.0.0 fijado](https://github.com/Taller-SW-Web/Modulo-de-Seguridad/blob/1b8f2e35448075a6c396b70fdd4ec1d5b1aa9201/specs/openapi.yaml). El runner comprueba el SHA-256 del YAML normalizado.

El runner fija el SHA de cada fuente y usa `git archive` para extraer el contexto de Docker de ese commit. Las modificaciones locales y los archivos sin seguimiento quedan fuera del build. Se necesita `tar` para extraer las fuentes. Compose construye el BFF y Prism, levanta PostgreSQL desechable y usa una red interna sin puertos publicados. Las imágenes y dependencias se obtienen antes del escaneo. Prism comparte el espacio de red del BFF y escucha exclusivamente en loopback. El destino de ZAP es `http://marketplace:10000`, el puerto del BFF. El hook envía solicitudes sintéticas esperadas a través del proxy ZAP para que el análisis pasivo vea también los POST. La base se inicializa con `db push` únicamente para QA desechable. El runner elimina los contextos temporales y el entorno al terminar y conserva [baseline.json](baseline.json) y [frontend-baseline.json](frontend-baseline.json), con reglas, rutas, estados y revisiones. Omitir `-FrontendSource` ejecuta solo el backend. No conserva cuerpos, cabeceras, valores de evidencia ni parámetros de URL.

## Casos dirigidos

En el backend `a7733f7`, en PostgreSQL 16 desechable accesible por loopback como base `g1_auth_h4_test` y esquema `public`, usa `DATABASE_URL` y `AUTH_TEST_DATABASE_URL` por variables de entorno:

```powershell
npm ci --no-audit --no-fund
npm run build
npx prisma db push --skip-generate
npm run test:unit -- src/security/auth.guard.spec.ts src/checkout/checkout.service.spec.ts
npm run test:e2e -- test/auth.e2e-spec.ts test/auth-g7.e2e-spec.ts test/account-g7.e2e-spec.ts test/password-reset-g7.e2e-spec.ts test/recovery-qa.e2e-spec.ts test/g7-introspection.e2e-spec.ts test/checkout.e2e-spec.ts
```

Resultado local: **39 unitarias y 134 E2E pasaron**. Build, lint y typecheck pasaron. La [evidencia del contrato Prism del PR #332](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44966976493/job/137038092325) suma 33 casos MOCK. Los [controles CI del PR #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44966970510) y [PR #332](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44966976493/job/137038092081) documentan SAST, SCA y secretos.

| Issue | Evidencia MOCK | Pendiente externo |
| --- | --- | --- |
| #26 | Registro pendiente, política, códigos neutros, consentimiento, canal fijado y respuestas saneadas. | Homologación G7 y revisión independiente. |
| #30 | MFA previo a sesión, JWT vencido o inválido, 401 uniforme, límites y expiración como respuestas del proveedor simulado. | Medir y confirmar límites en entorno G7 autorizado y revisión independiente. |
| #34 | Logout idempotente, CSRF, invalidación simulada, separación A/B y refresh protegido. | Revocación REAL y revisión independiente. |
| #38 | Dos 202 vacíos, temporización controlada, 429/timeout y exclusión de marcadores de los logs. | Latencia y límite efectivo en G7 y revisión independiente. |
| #42 | Reset 204 sin sesión, 401 usado, 410 vencido, política y exclusión de claves/tokens de respuestas y logs. | Referrer y analítica de la SPA G7 y revisión independiente. |
| #116 | Direcciones requieren autenticación. Las pruebas #331 cubren titular, rechazo de dirección ajena en cotización y ausencia de persistencia local de dirección. | G-ADDRESS REAL y revisión independiente. |

Prism selecciona ejemplos de contrato y carece de cuentas, correo y estado persistente. El consumo de un token, la revocación, el retraso controlado y la respuesta de rate limit se comprueban en las suites de BFF con dobles. La evidencia local no certifica el cumplimiento de esas reglas por el servicio desplegado.

## Navegador local

Frontend `8420d42855c9894267d6f06f8474834955d9b61e` en `127.0.0.1:3002` y backend #331 en `127.0.0.1:10002`, con Postgres 16 desechable y el emisor local `scripts/g7-contract-fixture.mjs` en `127.0.0.1:4012`. Para este recorrido el emisor firma tokens sintéticos. Prism se usa en el escaneo por separado. La SPA de G7 no participa.

- En el backend, ejecuta `node scripts/g7-contract-fixture.mjs` con `G7_FIXTURE_ACK=local-only`. Configura el BFF de desarrollo con base desechable, `PORT=10002`, `G7_API_URL=http://127.0.0.1:4012/api/v1`, `AUTH_ENABLED=true`, `G7_REGISTRATION_ENABLED=true`, `G7_RECOVERY_ENABLED=true`, `USE_MOCKS=true`, `G1_WEB_ORIGIN=http://127.0.0.1:3002` y `AUTH_SESSION_KEY` generado para la prueba. Después de compilar e inicializar el esquema, inicia `node dist/main.js`.
- En el frontend, define `MARKETPLACE_API_URL=http://127.0.0.1:10002`, `G1_AUTH_ENABLED=true`, `G1_WEB_ORIGIN=http://127.0.0.1:3002`, `H3_FRONTEND_ORIGIN=http://127.0.0.1:3002`, `H3_WISHLIST_READ_ENABLED=true`, `CHECKOUT_MODE=local-fixtures` y `NEXT_PUBLIC_CHECKOUT_MODE=local-fixtures`. Usa URLs HTTPS sintéticas de `example.invalid` para `G1_TERMS_URL` y `G1_PRIVACY_URL` y deja `NEXT_PUBLIC_G7_RECOVERY_URL` vacío. Inicia `node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3002` tras `npm ci`.

Desde el frontend:

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.auth.config.ts tests/auth/account-local.spec.ts tests/auth/g7-local.spec.ts tests/auth/fe98-g7-auth-negative.spec.ts
```

**6/6 pasaron** con Microsoft Edge. Cubren registro pendiente, retorno externo rechazado, MFA y OTP incorrecto sin sesión, salida y limpieza entre pestañas, y ruta heredada de reset sin token visible ni sesión. La ruta heredada devuelve `Referrer-Policy: no-referrer`.

Desde el worktree DAST:

```powershell
node tools/dast/browser-storage.mjs ../fe-dast-target
```

**1/1 pasó**. Tras login sintético, la sesión usa cookie `HttpOnly`. No se observó JWT, campo de credencial ni valor de esa cookie en `localStorage`, `sessionStorage` o cookies legibles por JavaScript. La respuesta de sesión tampoco expuso tokens. No se adjuntan capturas, trazas de navegador ni intercambios HTTP.

Inventario de dependencias del frontend en esa revisión: `npm audit --omit=dev` informó un paquete afectado (Next.js 16.4.1, severidad moderada) y cero altos/críticos. Sigue pendiente evaluar la aplicabilidad y actualizar esa dependencia en un cambio separado. El pase de navegador no descarta los avisos del proveedor. [Aviso sobre cookies del runtime Edge](https://github.com/vercel/next.js/security/advisories/GHSA-f3mh-rxg3-f5g2) · [Aviso sobre reenvío de respuestas](https://github.com/vercel/next.js/security/advisories/GHSA-pc58-hwjq-p385).

## Hallazgos de ZAP

Backend, ZAP 2.17.0: **15 solicitudes dirigidas** (todas con el estado esperado), dos reglas con avisos de severidad baja y ninguna alerta alta/crítica. El código 2 indica avisos. El JSON conserva las instancias que incluye el reporte de ZAP y descarta muestras de cabeceras y cuerpos.

| Regla | Clasificación | Motivo |
| --- | --- | --- |
| 10021 · X-Content-Type-Options ausente | Real, baja | El BFF omite `nosniff` en algunas respuestas. Añadirla como endurecimiento en un cambio aparte. |
| 10037 · X-Powered-By | Real, baja | El BFF revela el framework en respuestas locales. Deshabilitar esa cabecera en un cambio aparte. |

Frontend, ZAP 2.17.0: **5 solicitudes dirigidas**, todas con HTTP 200. El rastreo también alcanzó las páginas públicas que enlazan esos flujos. Ninguna alerta alta o crítica. En el reporte, la severidad va primero y el valor entre paréntesis indica la confianza del escáner.

| Regla | Clasificación | Motivo |
| --- | --- | --- |
| 10038 · Content Security Policy ausente | Real, media | Las páginas HTML locales carecen de CSP. Falta definir y validar una política compatible con Next.js en un cambio de producto separado. |
| 10019 · Content-Type ausente | Aceptado, informativa | Ocurre en redirecciones 307 de recuperación y reset. El destino HTML se comprueba por separado. |
| 10024 · Información sensible en URL | Real en MOCK, informativa | El rastreador detectó valores sintéticos en la URL de login y registro. El navegador con JavaScript envió POST, pero el marcado de ambos formularios carece de método explícito. Queda pendiente endurecer el envío HTML sin JavaScript. |
