# TASK-F009-BE-001 — preparación y comprobaciones propias

[Issue #56](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/56). Aporte de Giuliano, 03/11/2026. Se conserva responsable, revisor y DoD.

El fixture conserva ID ascendente al empatar nombres incluso con NAME_DESC, igual al código G6; dos regresiones cruzan el límite de página.

## Artefactos

- [src/catalog/fixtures.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/src/catalog/fixtures.ts)
- [src/catalog/catalog-tie-order.spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/src/catalog/catalog-tie-order.spec.ts)

## Evidencia ejecutada del corte

Backend: 320 unitarias y 55 casos HTTP/contrato de catálogo PASS; build/tipos PASS. Ocho pruebas del runner, tres del perfil de tiempos y tres de configuración PASS. Los contratos de catálogo usan dobles de BD/proveedor; no certifican PostgreSQL, grants o despliegue.

Matriz Next/BFF MOCK: 24 PASS, 0 FAIL, 0 BLOCKED y 1 INCONCLUSIVE por no observar nombres iguales en la muestra. Matriz web pública G1: 10 PASS de validación, 0 FAIL y 15 BLOCKED por lecturas 503/ruta 404 y dependencias de esos casos. Los resultados públicos no se convierten en integración exitosa.

Controles existentes de secretos/SAST/SCA PASS sin altas/críticas ni vulnerabilidades runtime; riesgos de desarrollo conservan revisión pendiente. No se ejecutó DAST de staging ni aceptación independiente. La issue permanece abierta; faltan revisión del nuevo HEAD y dependencias reales/despliegue de su función.

IA: Codex para código, pruebas y registro. La revisión técnica automatizada no se presenta como revisión humana independiente.
