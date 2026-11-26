# TASK-F007-BE-001 — avance verificado 03/11/2026

Responsable: Giuliano Macchiavello (`GiulianoMaPe`). [Issue #48](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/48). Rama `feat/giuliano-h4-issues-20261103`. Issue abierta; no se declara Terminado.

## Alcance y resultado propio

Validar q de 2–120 caracteres y adaptar búsqueda paginada pública, proteger query de logs identificables.

Lecturas al proveedor con cache no-store y prueba de query Unicode normalizada/codificada sin inyección de parámetros.

- [src/catalog/provider.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/src/catalog/provider.ts)
- [src/catalog/issue48.spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/src/catalog/issue48.spec.ts)

## Verificación ejecutada

`npm run build` y `npm run typecheck`: PASS. `npm run test:unit`: 294 PASS. Catálogo HTTP/contrato: 49 casos PASS (48 originales más la regresión HTTP de ID opaco; esta última suite pasó 15 casos). PostgreSQL real no se utilizó: los tests de catálogo sustituyen la base de datos.

Se distinguen fixtures MOCK, contrato HTTP local/sintético y transporte REAL de demo. Los totales son de las suites indicadas, no cobertura certificada de todos los criterios de la funcionalidad.

Seguridad local: controles existentes de secretos/SAST/SCA PASS, sin altas/críticas ni vulnerabilidades runtime. El corte de desarrollo tiene 18 moderadas y 3 bajas; requieren revisión de riesgos. SAST usa cuatro reglas locales. DAST de staging y aceptación independiente pendientes.

## Ensayo REAL local y despliegue

Fecha UTC del ensayo del adaptador: `2026-11-03T19:06:32.557Z`. Modo histórico `demo-no-auth`, sin JWT; presupuesto 20 s. El proceso de ensayo permitió únicamente el hostname de medios observado en el payload público de G6 (`slzglmtiyrzygpkiuthf.supabase.co`); no se cambió allowlist ni configuración de producción. No se atribuye homologación del host a G6/G7 ni aprobación humana.

```json
[
  {
    "name": "F007-search",
    "status": "PASS_DEMO_READ",
    "source": "REAL",
    "durationMs": 4548,
    "products": 4,
    "page": {
      "number": 0,
      "size": 4,
      "totalElements": 5,
      "totalPages": 2
    },
    "sort": null
  },
  {
    "name": "F007-empty",
    "status": "PASS_DEMO_READ",
    "source": "REAL",
    "durationMs": 534,
    "products": 0,
    "page": {
      "number": 0,
      "size": 4,
      "totalElements": 0,
      "totalPages": 0
    },
    "sort": null
  }
]
```

Sondeo público G1 del 03/11: home y búsqueda 503/CATALOG_UNAVAILABLE con UNCONFIGURED; filtros 404/NOT_FOUND. No se identifica el SHA desplegado. El adaptador local no acredita ese despliegue.

## Criterio pendiente para cerrar

DoD de la issue: DTO, validación, errores y ownership probados con fixtures; transacciones/versiones donde aplica. Adaptador real no activado si gate externo sigue abierto.

Acreditar identidad técnica/grants G1→G6/G7 y casos desde el corte G1 desplegado. El modo público demo-no-auth no sustituye esa identidad.

Nueva revisión independiente de estos cambios, publicación y prueba del SHA desplegado y dependencias OPS aplicables.

Backend #237 y SPECS #13 fueron aprobados por Leo y fusionados a develop el 01/11. Frontend #110 tiene aprobación de Sebastian y una solicitud de cambios anterior de Leo aún registrada. Esas revisiones corresponden a sus HEAD originales; no aprueban este nuevo corte. No se modifican revisores ni criterios de aceptación.

IA utilizada: Codex para revisar código, generar cambios/pruebas y este registro; lectura y ejecución técnica automatizadas. Revisión humana de Giuliano y revisor asignado pendiente. No se atribuye al autor aceptación independiente ni demostración de producción.
