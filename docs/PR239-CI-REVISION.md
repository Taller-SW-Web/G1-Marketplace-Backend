# PR 239: CI y verificación conectada

Revisión del 2026-11-02. Cambios destinados a la PR backend #239 y a la PR frontend #118; no se hace merge en GitHub. La validación original fue local y se conserva a continuación.

## Base reproducible

- Head de PR: `87edc101e531db9ebe6821c2790ce7882a19a4dc`.
- Develop local inspeccionado: `d4dcad002c540d038aeb73dd7f4568c5a9c39f87`.
- Checkout integrado: `output/pr239-review`, rama `fix/pr239-ci-connected`, merge local `ab23ba49308e1286c55009e11cdf4c2977c05a53`, más cambios de esta revisión.
- Frontend: `a96f4d434a7014616257c922546175cd4327031a` más el trabajo local existente y los archivos de esta revisión. La evidencia no corresponde solo a ese commit limpio.
- Run fallido consultado: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/41364429217

## Diagnóstico y cambios

`checkout.integration-spec.ts` procede de develop. El job aislado descubre todas las suites de integración, por lo que también prueba checkout al validar la combinación con la PR.

Prisma 5.22 devuelve un error desconocido para CHECK de PostgreSQL (SQLSTATE 23514), no el P2004 que esperaba el test. Se comprueba el nombre de cada restricción y que ninguna operación inválida quede persistida. Además se eliminan los ítems del carrito antes del intento de borrado para que el trigger del cascade no oculte la prueba de su clave foránea.

`diego-h4.yml` limita el job a PRs del mismo repositorio desde `feat/diego-h4-favoritos-csat` o ejecución manual. El archivo viajará a develop; el job quedará omitido en otras ramas. Se conservan los filtros por archivos. `auth-h4.yml` ya existía y se conserva como validación compartida de autenticación.

## Resultados

- Backend build y typecheck: aprobados.
- Unitarias: 229 aprobadas.
- HTTP: 225 aprobadas, 17 omitidas por sus condiciones de entorno.
- Scripts de auth/probe: 10 aprobados.
- `npm run test:diego:isolated`: 41 de integración y 13 de sesiones G7 persistidas aprobadas. Cuatro migraciones aplicadas y redeploy sin pendientes.
- Generación OpenAPI: sin diferencia de contenido respecto al contrato versionado.
- Frontend componentes: 201 aprobados; servidor: 55 aprobados.
- Frontend build de producción y typecheck: aprobados.
- E2E conectados: 7 aprobados. Identidad y catálogo controlados mediante proveedores de prueba; Ventas/Postventa mediante HTTP loopback. Navegador, Next, Nest, Prisma y PostgreSQL reales.
- Frontend lint: sin errores; aviso preexistente de dependencias de useEffect en OrdersHistory.tsx.

Las peticiones auxiliares de catálogo de la cabecera pueden devolver 503 en este entorno acotado. Esta suite acredita favoritos y CSAT, no el catálogo general ni integraciones externas reales.

## Repetir

Desde este checkout backend, con dependencias instaladas y Docker disponible:

```powershell
npm run test:diego:isolated
```

Desde `G1-Marketplace-Frontend`:

```powershell
$env:H4_BACKEND_DIR='D:\Proyectos\G1-Marketplace\output\pr239-review'
npm run test:e2e:h4:connected
```

Ver `docs/H4-CONNECTED-VERIFICATION.md` del frontend para requisitos y cobertura. El runner crea una instancia PostgreSQL exclusiva, usa puertos dinámicos y elimina solo su contenedor y procesos. No usa bases compartidas ni db push.
