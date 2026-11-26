# Correcciones y ampliación para revisión local — 28/10/2026

Rama funcional: `feat/diego-h4-favoritos-csat`, PR #239. Este corte complementa EVIDENCIA.md; los 399 casos del corte anterior son históricos. Revisión humana e integración externa siguen pendientes.

## Hallazgos corregidos

| Frente | Antes | Corrección y evidencia |
|---|---|---|
| F-037 | Todas las proyecciones se lanzaban en paralelo | Enriquecimiento en lotes de cuatro, manteniendo el orden de BD aunque terminen al revés; no se inicia el siguiente lote tras fallo. Pruebas con nueve productos, vacío y respuesta malformada. |
| G6 variantes | Todos los precios se consultaban en paralelo | Lotes de cuatro precios por proyección. Se conserva el precio mínimo autorizado y no se selecciona SKU para carrito. El límite es por operación: cuatro productos pueden tener hasta cuatro consultas de precio cada uno; no es un limitador global entre solicitudes. |
| F-036/F-039 | SKU simple inválido o variante duplicada podía alcanzar consultas posteriores | Rechazo de segmentos `.`/`..`, controles, identidad ausente y SKU duplicado en variantes. Sin requests comerciales para una identidad inválida. |
| F-040 | IsOptional admitía null para motivos/comentario pese a un OpenAPI no nullable | Sólo se permite omitir el campo; null se rechaza con 400 antes de persistencia/proveedor. Se conservan motivos únicos y límite/comentario sin controles. No cambia el contrato publicado. |

## Ampliación de pruebas CSAT

- Mapeo de 401/403/404/5xx al consultar pedido, sin emitir CSAT.
- Rechazos del proveedor 401/403/422 y respuestas 200/errores desconocidos: no se marca el prompt como enviado.
- Timeout del POST después de recibir su cuerpo en el servidor de prueba: una única emisión, sin reintento automático y con prompt SHOWN conservado.
- Confirmación de Ventas seguida de fallo de persistencia: error público sanitizado; un reintento manual con duplicado canónico reconcilia el estado.
- Dos envíos concurrentes en PostgreSQL 16: el proveedor simulado confirma uno y rechaza el otro por unicidad; un éxito, un 409 y prompt SUBMITTED con timestamps válidos. Esto prueba la reconciliación local, no la unicidad efectiva del proveedor externo.

## Resultado local

`npm run build`, `npm run typecheck`, `npm test` y `npm run test:diego:isolated` aprobados. Unitarias: 170; HTTP: 207; scripts: 10; integración PostgreSQL: 25; sesiones G7 persistidas: 13. **Total: 425 aprobadas**. Las 13 sesiones omitidas sin base en el test genérico se cuentan sólo en su ejecución aislada. Las bases temporales se eliminaron al terminar. Los logs de error provocados para comprobar sanitización/rollback no son fallos de suites.

Los proveedores externos siguen simulados, con adaptadores nuevos desactivados por defecto. Los escaneos del corte previo no acreditan automáticamente este nuevo SHA; consultar los checks actuales del PR #239 para build, pruebas y seguridad. No se modifican Frontend, migraciones ni contratos SPECS en este corte.

## Issues que pueden revisarse ahora

Fernando Saire puede revisar implementación, pruebas y documentación local, sin cerrar INT:

| Función | Backend | Persistencia | QA local | Documentación preparada |
|---|---|---|---|---|
| F-036 | #175 | #176 | #178 | #179 |
| F-037 | #180 | #181 | #183 | #184 |
| F-038 | #185 | #186 | #188 | #189 |
| F-039 | #190 | #191 | #193 | #194 |
| F-040 | #195 | #196 | #198 | #199 |

Jim Segovia puede revisar los borradores de seguimiento #208 y reestimación #219; todavía faltan confirmaciones/evidencia del equipo para cerrarlos. PR de código #239 y contrato F-039 SPECS #15. PR #240 contiene el seguimiento.

En espera de conexiones reales: #177, #182, #187, #192, #197 y la validación transversal #214. Una revisión de código local puede producir hallazgos y aprobación del incremento, sin afirmar cierre de la funcionalidad ni del gate externo.
