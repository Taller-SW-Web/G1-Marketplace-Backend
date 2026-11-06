# Seguimiento Git y de issues

Fecha: 28/10/2026. Rama nueva: `docs/diego-h4-seguimiento-issues`, basada en `feat/diego-h4-favoritos-csat` (`d8bf38c`). No se reescribe el historial publicado ni se duplican los commits de implementación. El PR de seguimiento apunta a la rama de implementación; el PR funcional #239 conserva destino develop.

## Commits de implementación publicados

| Commit | Categoría | Cambio |
|---|---|---|
| 8017739 | feat(wishlist) | G6 y aislamiento de favoritos |
| 1ce075e | feat(csat) | Evaluación autorizada, gates y pruebas aisladas |
| cfea0c1 | docs(h4) | Evidencia y revisiones de las 28 issues |
| d8bf38c | docs(h4) | Enlaces a PR y metadatos de seguridad |

SPECS conserva su rama `docs/diego-f039-conservar-favorito` y PR #15. Los cambios documentales nuevos usan `docs(issues)` conforme a Conventional Commits. Se conservan las ramas de implementación para que las referencias de las issues sigan resolviendo.

## Marcado de progreso

Se registra avance local, comentario individual con alcance, SHA, rama, PR, evidencia y pendientes en las 28 issues asignadas: #175–#199, #208, #214 y #219.

El checklist «Implementado con datos de prueba» se marca sólo en las 15 tareas BE/DB/QA funcionales de F-036–F-040, con el alcance local explícito. Documentación registra preparación; integración y transversales conservan sus requisitos pendientes. Ninguna aprobación, integración REAL ni validación de despliegue se marca como realizada. Ninguna issue se cierra sin satisfacer su DoD.

Los enlaces de rama y PR se incluyen en cada cuerpo/comentario para navegar al código; esto no afirma una asociación nativa en el panel Development de GitHub. No se cambian responsables, revisores, etiquetas ni prioridades.

Validación de este incremento documental: `git diff --check` y verificación remota de comentarios/checklists. No se vuelven a ejecutar pruebas de código sin cambios funcionales; la implementación mantiene la evidencia y CI del PR #239.
