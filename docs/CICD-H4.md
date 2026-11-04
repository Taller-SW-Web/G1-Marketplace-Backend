# CI/CD y versionado — H4 (Backend)

Workflow: `.github/workflows/cicd.yml`. Se ejecuta en cada push a `develop`; en las PR corre sólo Build/Compile/Test.

| Etapa | Qué hace |
|---|---|
| Build | `prisma generate` + `tsc` (`npm run build`). |
| Compile | `npm run lint` (`tsc --noEmit`) y `prisma validate`. |
| Test | `npm test`: unitarias, e2e, mock-auth y sonda G6. |
| Versionado | `semantic-release` lee los commits convencionales (`fix:` → PATCH, `feat:` → MINOR, `feat!:`/`BREAKING CHANGE` → MAJOR), actualiza `package.json` y `CHANGELOG.md`, crea el tag `vX.Y.Z` y el release en GitHub. La versión no se edita a mano. |
| Deploy | Dispara el deploy hook de Render sólo si Build/Compile/Test pasaron. |
| Smoke test | `curl` con reintentos al sitio/`/health`; si no responde 200, el pipeline falla. |

## Configuración requerida (una sola vez)

- Secreto `RENDER_DEPLOY_HOOK_URL` en Settings → Secrets → Actions (URL del deploy hook).
- Desactivar el auto-deploy de Render para que el pipeline sea el único que despliega.
- Opcional: variable `BACKEND_HEALTH_URL` para sobrescribir la URL del smoke test.

## Imagen Docker

Cuando el versionado publica una versión, el job `docker-image` construye el `Dockerfile` del repo y publica `ghcr.io/taller-sw-web/g1-marketplace-backend:X.Y.Z` (y `latest`) con **la misma versión** del tag Git.
