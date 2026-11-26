# TASK-F006-BE-001 — preparación y comprobaciones propias

[Issue #44](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/44). Aporte de Giuliano, 03/11/2026. Se conserva responsable, revisor y DoD.

Implementación editorial optativa: configuración ordenada, GET comercial por ID, límites/concurrencia/deadline compartido y proyección pública. REAL exige aprobación adicional; la selección real sigue pendiente.

## Artefactos

- [src/catalog/featured.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/src/catalog/featured.ts)
- [src/catalog/provider.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/src/catalog/provider.ts)
- [src/catalog/featured.spec.ts](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/src/catalog/featured.spec.ts)
- [docs/CATALOGO-H4-DESTACADOS.md](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/feat/giuliano-h4-issues-20261103/docs/CATALOGO-H4-DESTACADOS.md)

## Evidencia ejecutada del corte

Backend: 320 unitarias y 55 casos HTTP/contrato de catálogo PASS; build/tipos PASS. Ocho pruebas del runner, tres del perfil de tiempos y tres de configuración PASS. Los contratos de catálogo usan dobles de BD/proveedor; no certifican PostgreSQL, grants o despliegue.

Matriz Next/BFF MOCK: 24 PASS, 0 FAIL, 0 BLOCKED y 1 INCONCLUSIVE por no observar nombres iguales en la muestra. Matriz web pública G1: 10 PASS de validación, 0 FAIL y 15 BLOCKED por lecturas 503/ruta 404 y dependencias de esos casos. Los resultados públicos no se convierten en integración exitosa.

Controles existentes de secretos/SAST/SCA PASS sin altas/críticas ni vulnerabilidades runtime; riesgos de desarrollo conservan revisión pendiente. No se ejecutó DAST de staging ni aceptación independiente. La issue permanece abierta; faltan revisión del nuevo HEAD y dependencias reales/despliegue de su función.

IA: Codex para código, pruebas y registro. La revisión técnica automatizada no se presenta como revisión humana independiente.


## Regla confirmada por Giuliano a partir del mensaje de Jim — 03/11/2026

**Prioridad:** destacados definidos → históricos más vendidos → aleatorios sólo cuando todavía no hay historial. Esto sustituye la selección exclusivamente editorial propuesta en el corte anterior. La confirmación de la prioridad y de la métrica no certifica revisión de código, contrato aceptado por el proveedor ni despliegue.

Giuliano eligió documentar como criterio de históricos las **unidades vendidas del canal MARKETPLACE, en todo el historial, con pago confirmado, descontando devoluciones confirmadas**. Se agrupan por producto, no por variante/SKU. La fuente autorizada y su contrato siguen pendientes de homologación; no se calculó un ranking con datos de compradores o importes administrativos.

La alternativa se evalúa al quedar vacía la selección anterior. Una selección definida parcialmente elegible se conserva sin rellenarla con otras fuentes. Si hay historial pero ninguno de sus productos es publicable, la sección puede quedar vacía: no se afirma que no haya historial. Un fallo o ausencia de la fuente de ventas es indisponibilidad técnica y no habilita aleatorios.

Implementación/demos de los tres caminos con datos sintéticos; la fuente real de ventas sigue sin conectar. El default se conserva desactivado y activar REAL sin fuente no fabrica historial vacío. Este avance pertenece únicamente a la issue indicada; las decisiones, pruebas anteriores y sus límites se conservan como cortes históricos. La issue sigue abierta, con DoD/revisor intactos.


Verificación de la nueva política: Backend 354 pruebas unitarias (34 de selección) y 62 HTTP/contratos de catálogo (7 nuevas de prioridad), tipos y build PASS. Tres demos mediante Next/BFF MOCK PASS; cinco recorridos de destacados en Edge PASS. La fuente real de ventas continúa sin conectar; estos resultados no prueban homologación, grants o despliegue.
