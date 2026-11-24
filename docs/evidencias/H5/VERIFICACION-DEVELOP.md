# Verificación local de develop tras las fusiones · H5

- **Backend:** `d595caa06775e463ac9ad768c486cfa1482d69fa` de `origin/develop`, desde un worktree nuevo y limpio. Incluye los merges BE #253, #331, #332, #333, #338 y #339.
- **Frontend para DAST:** `e56a13e040ba9641b600fbc937dc3863b0ecc6e7` de `origin/develop`.
- **Entorno:** Windows, Node 24.19.0, npm 11.17.0 y Docker Desktop 29.7.2. Datos sintéticos y PostgreSQL 16 desechable. **MOCK** en las fronteras de módulos. No se contactó a G7 desplegado.

## Backend

| Comando | Resultado |
| --- | --- |
| `npm ci --no-audit --no-fund` | Instalación correcta |
| `npm run build` | Prisma Client generado y compilación correcta |
| `npx prisma db push --skip-generate` | Esquema de prueba inicializado en PostgreSQL desechable |
| `npm test` | 46 suites unitarias con 579 pruebas y 26 suites E2E con 391 pruebas, todas pasaron. También pasaron los 4 casos del emisor MOCK, 6 del probe G6 con dobles y 2 del kit G7. |

Para repetirlo, provisionar un PostgreSQL 16 desechable con una base llamada `g1_auth_h4_test` y puerto publicado solo en `127.0.0.1`. Configurar `DATABASE_URL` y `AUTH_TEST_DATABASE_URL` con esa misma base y `?schema=public`, usando credenciales efímeras por variables de entorno. La suite de sesiones verifica esos parámetros para habilitar sus casos. En el worktree del SHA indicado:

```powershell
npm ci --no-audit --no-fund
npm run build
$env:NODE_ENV = 'test'
$env:USE_MOCKS = 'true'
$env:AUTH_ISSUER = 'https://security.example.test'
$env:AUTH_JWKS_URL = 'https://security.example.test/jwks'
npx prisma db push --skip-generate
npm test
```

`db push` se usó para el esquema temporal. La corrida no valida migraciones de despliegue ni sustituye un smoke del servicio publicado.

## Contrato de Seguridad y Usuarios

**MOCK Prism: 33/33 pasaron.** Se usó Prism 5.16.0 en un contenedor sin red externa y el [OpenAPI G7 1.0.0 fijado en `1b8f2e3`](https://github.com/Taller-SW-Web/Modulo-de-Seguridad/blob/1b8f2e35448075a6c396b70fdd4ec1d5b1aa9201/specs/openapi.yaml). El SHA-256 del YAML con finales LF fue `61bf8deb1803b1eb332b55a28b5d73d917654c1229215b2b4ebb51b82796d435`. Se probaron ejemplos positivos y negativos de registro, confirmación, login, OTP, refresh, logout, recuperación, reset, JWKS y consulta de usuario. La rotación y la persistencia pertenecen a los E2E con estado. Prism devuelve ejemplos del contrato.

Para repetir en el mismo aislamiento, construir la imagen con `docker build -t h5-prism-5.16.0 -f tools/dast/Prism.Dockerfile tools/dast`. Montar el OpenAPI fijado como `/contract/openapi.yaml` y `test/g7-prism-contract.test.mjs` como `/tmp/contract.test.mjs`, ambos solo lectura en un contenedor con `--network none`. En él se ejecutó `prism mock /contract/openapi.yaml -h 127.0.0.1 -p 4010` en segundo plano. Tras comprobar con un GET el JWKS local, se ejecutó `node --test /tmp/contract.test.mjs` sin configurar `G7_CONTRACT_REAL_URL`. [Workflow original de contrato](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44966976493/job/137038092325).

La [matriz de cierre](CIERRE-ISSUES-JIM.md) registra qué evidencia queda pendiente por issue. G-AUTH y G-ADDRESS siguen pendientes de autorización, credenciales y evidencia REAL.

## DAST pasivo aislado

El runner completó ambas ejecuciones con ZAP 2.17.0. Construyó desde los commits registrados y levantó los servicios en una red interna con Prism como G7. Ejecutado desde el worktree backend en el SHA de esta verificación:

```powershell
pwsh -NoProfile -File tools/dast/run.ps1 -AppSource . -FrontendSource ../fe-verificacion-dast `
  -Contract ../../repositories/Modulo-de-Seguridad/specs/openapi.yaml `
  -Output (Join-Path $env:TEMP 'h5-verificacion-dast-d595caa')
```

Para repetir desde una rama de documentación posterior al corte, preparar worktrees separados en los dos SHA indicados arriba y pasar sus rutas en `-AppSource` y `-FrontendSource`. Así se conserva la revisión exacta del reporte.

| Informe sanitizado | Cobertura | Resultado |
| --- | --- | --- |
| [Backend](verificacion-develop/baseline.json) | 15 solicitudes dirigidas | Código ZAP 2 por avisos. Dos reglas de severidad baja: falta `X-Content-Type-Options` y se expone `X-Powered-By`. Los marcadores sintéticos no aparecieron en los logs del backend. |
| [Frontend](verificacion-develop/frontend-baseline.json) | 5 solicitudes dirigidas | Código ZAP 2 por avisos. Una regla de severidad media por CSP ausente y dos informativas. `10019` figura en respuestas 307 y `10024` en URLs rastreadas con datos sintéticos. |

No hubo alertas altas ni críticas en este análisis pasivo. La clasificación de los hallazgos y los límites del escaneo están en el [informe DAST](dast/README.md). El análisis permanece **MOCK** y no constituye una aprobación de los gates.
