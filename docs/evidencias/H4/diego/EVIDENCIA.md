# Evidencia local — Diego H4

Fecha: 28/10/2026. Baseline Backend: `cd0b93a1949aa7b08ecc3495dc5a1224d51dbe14`. SPECS actualizado desde `46005a4`; cambio F-039 preparado en rama propia. Ver historial de la rama/PR para SHA exacto de implementación. Revisión independiente pendiente.

## Clasificación

| Nivel | Evidencia de este corte |
|---|---|
| Diseñado | Contratos F-039 revisados por decisión del solicitante; OpenAPI BFF con CSAT y gates documentados. Aceptación de Fernando pendiente. |
| Implementado con datos de prueba | Favoritos G6 y CSAT implementados; casos unitarios, HTTP local y PostgreSQL 16 real temporal. Identidad/proveedores de estas pruebas son fixtures explícitas. |
| Integrado con otro módulo REAL | No acreditado. No se usaron credenciales reales G7/G6/G5 ni se activaron integraciones externas en este corte. |
| Probado en despliegue | No acreditado. No se desplegó, no se operaron bases compartidas y no se cerraron issues. |

## Comandos y resultados

Entorno: Windows, Node 24.16.0, dependencias del lockfile del baseline. `npm ci --no-audit --no-fund` restauró 614 paquetes. El fallo inicial SWC no era un fallo de aplicación: el sandbox bloqueaba materializar la caché nativa. Las pruebas se ejecutaron con acceso a esa caché; no se sustituyó el transformador ni se cambió el lockfile.

| Comando | Resultado |
|---|---|
| npm run build | Prisma Client 5.22.0 generado y compilación TypeScript aprobada. |
| npm run typecheck | Aprobado. |
| npm run test:unit | 18 suites, 161 pruebas aprobadas. |
| npm run test:e2e | 15 suites, 191 pruebas aprobadas. 13 pruebas de sesiones omitidas sin su base específica; ejecutadas después en el comando aislado. |
| npm run test:mock-auth | 4 pruebas aprobadas. |
| npm run test:g6:probe | 6 pruebas aprobadas. |
| npm run test:diego:isolated | 3 suites de integración, 24 pruebas aprobadas; más 13 pruebas de sesiones G7 persistidas aprobadas. |
| npm run docs:openapi | Generado el contrato versionado. |

Total: **399 pruebas aprobadas**, contando las sesiones omitidas en la ejecución genérica sólo en su ejecución aislada. Los logs ERROR de error interno corresponden a casos de inyección deliberada de fallo para comprobar rollback y sanitización; las suites terminaron sin fallos.

El ejecutor creó dos bases exclusivamente dentro de su contenedor PostgreSQL 16 temporal, sin volúmenes: marketplace_h3_test y g1_auth_h4_test. Se aplicaron las cuatro migraciones históricas; la segunda ejecución sobre la primera base confirmó cero pendientes. Constraints de timestamps, unicidad, ownership y rollback transaccional se verificaron. El primer ensayo descubrió que SUBMITTED exige shownAt; se corrigió el servicio para requerir SHOWN y la fixture para respetar eligibleAt ≤ shownAt. Retest aprobado. No se acredita downgrade de esquema ni historial real de Render.

## Casos y trazabilidad

- #175–#179: alta 201/repetición 200, fecha conservada, concurrencia, elegibilidad y persistencia por titular. Rechazo de selección de dueño en query/body.
- #180–#184: orden estable por titular, vacío sin invocar catálogo, producto retirado conservado, agotado distinto de caída/INDETERMINADO, precio vigente y medios autorizados.
- #185–#189: DELETE repetido y ajeno, rechazo de bodies/query, restauración con nuevo id/createdAt y nueva validación de elegibilidad.
- #190–#194: adición conserva favorito/fecha; dos acciones explícitas suman dos unidades; bloqueo común con carrito, cantidad acumulada, stock, variante 422, redirección interna, rollback sin pérdidas. Pruebas existentes de PostgreSQL se reutilizaron y se reforzó Undo.
- #195–#199: DTO, autenticación, titularidad de pedido y prompt, entrega, 5/3/1, rechazo de campos de cliente/canal, gates apagados, timeout/malformado, duplicado canónico, conflicto desconocido y persistencia UX. CSAT no agrega tabla/migración ni productor de prompts.
- #208/#214: snapshot de 28 issues propias y 40 funciones FE/BE. La matriz transversal REAL/despliegue sigue pendiente de evidencia por operación.
- #219: reestimación preliminar y confirmaciones de evento/carga pendientes, sin pruebas externas de carga ejecutadas.

## Seguridad

- Semgrep 1.181.0: **0 hallazgos y 0 errores**, cuatro reglas versionadas sobre src/scripts (122 archivos analizados). Ejecución en contenedor sin red, directorios montados sólo lectura; no representa una auditoría exhaustiva de OWASP. El primer montaje de todo el repositorio se detuvo por falta de progreso; el retest con sólo los directorios necesarios terminó correctamente.
- Gitleaks 8.30.1, binario verificado por SHA-256 mediante el instalador del repositorio: **0 hallazgos** en el árbol de trabajo. Escaneos de artefacto/historial se registran por separado en los metadatos sanitizados adjuntos.
- npm audit: **7 vulnerabilidades bajas; 0 moderadas, altas o críticas**. No se aplicaron los downgrades mayores propuestos para herramientas de desarrollo. Revisión de aceptación de riesgo por Seguridad pendiente.
- DAST y prueba de controles sobre despliegue: pendientes de destino y ventana autorizados; no se sustituyen por estas pruebas locales.

Los JSON adjuntos contienen sólo metadatos de escaneo; no tokens, cuerpos, cuentas reales ni hallazgos con secretos. `.f037-update.py` fue inspeccionado y preservado fuera del commit.

## Revisión y uso de IA

Código, documentación y pruebas preparados con Codex. Propósito: adaptación a baseline, adaptadores G6/CSAT, pruebas y trazabilidad. Revisión humana de Fernando Saire/Jim Segovia pendiente; este documento no afirma aprobación. No se enviaron mensajes a revisores ni se habilitaron proveedores. Los flags quedan apagados en la configuración de ejemplo.

Antes de cerrar INT/QA/DOC: adjuntar revisiones desplegadas G1/proveedor, contrato/grants, datos autorizados, positivo/negativo/vacío/timeout pertinente, identidad A/B, request/response sanitizados y trazas UI/API. Registrar hallazgo/retest y aprobación independiente.
