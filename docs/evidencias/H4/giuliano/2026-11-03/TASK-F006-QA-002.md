# TASK-F006-QA-002 — avance verificado 03/11/2026

Responsable: Giuliano Macchiavello (`GiulianoMaPe`). [Issue #46](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/46). Rama `feat/giuliano-h4-issues-20261103`. Issue abierta; no se declara Terminado.

## Alcance y resultado propio

Producto inactivo no publicable, enlaces hero seguros y medios allowlist.

Ejecutados negativos propios del contrato y controles de seguridad, con límites de integración/despliegue separados.

- [src/catalog/issue46.spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/src/catalog/issue46.spec.ts)

## Verificación ejecutada

`npm run build` y `npm run typecheck`: PASS. `npm run test:unit`: 294 PASS. Catálogo HTTP/contrato: 49 casos PASS (48 originales más la regresión HTTP de ID opaco; esta última suite pasó 15 casos). PostgreSQL real no se utilizó: los tests de catálogo sustituyen la base de datos.

Se distinguen fixtures MOCK, contrato HTTP local/sintético y transporte REAL de demo. Los totales son de las suites indicadas, no cobertura certificada de todos los criterios de la funcionalidad.

Seguridad local: controles existentes de secretos/SAST/SCA PASS, sin altas/críticas ni vulnerabilidades runtime. El corte de desarrollo tiene 18 moderadas y 3 bajas; requieren revisión de riesgos. SAST usa cuatro reglas locales. DAST de staging y aceptación independiente pendientes.

## Ensayo REAL local y despliegue

Fecha UTC del ensayo del adaptador: `2026-11-03T19:06:32.557Z`. Modo histórico `demo-no-auth`, sin JWT; presupuesto 20 s. El proceso de ensayo permitió únicamente el hostname de medios observado en el payload público de G6 (`slzglmtiyrzygpkiuthf.supabase.co`); no se cambió allowlist ni configuración de producción. No se atribuye homologación del host a G6/G7 ni aprobación humana.

```json
[
  {
    "name": "F006-home",
    "status": "PASS_DEMO_READ",
    "source": "REAL",
    "durationMs": 367,
    "categories": 8,
    "featured": 0
  }
]
```

Sondeo público G1 del 03/11: home y búsqueda 503/CATALOG_UNAVAILABLE con UNCONFIGURED; filtros 404/NOT_FOUND. No se identifica el SHA desplegado. El adaptador local no acredita ese despliegue.

## Criterio pendiente para cerrar

DoD de la issue: Negativos de seguridad pasan en entorno propio/autorizado, scans SAST/SCA/secrets y DAST aplicable adjuntos sin secretos. Sin hallazgo crítico/alto explotable abierto.

Acordar curaduría/campos de destacados con Jim/PO y G6. Home de demo devuelve categorías y cero destacados; no acredita el criterio de destacados.

Nueva revisión independiente de estos cambios, publicación y prueba del SHA desplegado y dependencias OPS aplicables. Completar además DAST aplicable en staging autorizado y aceptación de riesgos; los scans locales no lo sustituyen.

Backend #237 y SPECS #13 fueron aprobados por Leo y fusionados a develop el 01/11. Frontend #110 tiene aprobación de Sebastian y una solicitud de cambios anterior de Leo aún registrada. Esas revisiones corresponden a sus HEAD originales; no aprueban este nuevo corte. No se modifican revisores ni criterios de aceptación.

IA utilizada: Codex para revisar código, generar cambios/pruebas y este registro; lectura y ejecución técnica automatizadas. Revisión humana de Giuliano y revisor asignado pendiente. No se atribuye al autor aceptación independiente ni demostración de producción.
