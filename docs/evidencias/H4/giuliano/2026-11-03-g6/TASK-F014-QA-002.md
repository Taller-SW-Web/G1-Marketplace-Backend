# TASK-F014-QA-002 — frontera comercial y parche heredado

[Issue #78](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/78). Base: rama comercial de Sebastián; aporte de Giuliano.

`g6-availability.security.spec.ts` añade 19 casos sobre respuestas ambiguas, SKU ajeno, estado desconocido, nombres de prototipo, contexto inválido y campos internos/no contratados. Una respuesta de error con status 503 no satisface el mapper de respuesta exitosa. Las tres regresiones HTTP distinguen 200 indeterminado, 503 Problem Details y 409 por SKU ajeno.

El primer SCA detectó un hallazgo alto heredado en `follow-redirects` 1.16.1. Se actualiza exclusivamente su entrada del lockfile a 1.16.2, versión ya validada en el PR anterior de Giuliano. Se reinstaló con `npm ci` y se repitieron compilación/tipos, las 203 unitarias y los 32 casos HTTP comerciales.

Los controles existentes de secretos, SAST y SCA pasan después del parche; runtime sin vulnerabilidades y sin altas/críticas en el total. Se conservan 18 avisos moderados y tres bajos de herramientas de desarrollo, pendientes de revisión de riesgo. SAST usa las reglas locales existentes: no certifica ausencia universal de vulnerabilidades.

No se ejecutó PostgreSQL real ni DAST de staging. La evidencia de app local/MOCK no cierra esos criterios ni constituye aceptación independiente.

## Límites y revisión

Este aporte de Giuliano continúa las ramas de Sebastián; no modifica asignación ni revisor de la issue. Se mantiene separado de las entregas F-006–F-010. No se afirma aprobación humana, identidad G7, integración REAL ni despliegue. No se ejecutaron reservas, consumo de cupón ni operaciones contra servicios remotos.

La issue conserva su DoD y permanece abierta. Faltan revisión independiente del nuevo corte, integración autorizada y comprobación del SHA desplegado. IA: Codex para implementación, pruebas y registro; revisión humana pendiente.


## Revalidación 05/11/2026 tras #232

PR #266 actualizada con develop y reapuntada a develop. Conflictos resueltos conservando cuatro estados, validación cerrada de campos e identidad y los cambios integrados de Sebastián. OpenAPI 1.1.0 alineado con UNDETERMINED; incluye respuesta HTTP de producto-demostracion-7 validada contra el schema.

Build, tipos, 299 unitarias y 114 HTTP/contratos PASS; cinco OpenAPI válidos. Después del ajuste documental del contrato, 12 pruebas OpenAPI PASS. Ensayo MOCK local; no se llama a inventario G6 ni se certifican grants o producción. El demo del viernes 06/11 a las 12:00 Lima será MOCK rotulado local junto con BE #265 y FE #124/#125. Configuración Render exclusivamente a cargo de Andrés. Las issues conservan su DoD y revisión independiente.
