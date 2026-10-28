# Entregas de Diego: favoritos y CSAT

Actualización: [correcciones, 425 pruebas y lista de issues para revisión local](evidencias/H4/diego/CORRECCIONES-REVISION.md). El corte anterior de 399 pruebas se conserva como evidencia histórica.

Corte: 28/10/2026. Baseline: `origin/develop` `cd0b93a1949aa7b08ecc3495dc5a1224d51dbe14`.
Responsable: Diego Espinoza. Revisor funcional/QA: Fernando Saire; seguimiento/reestimación: Jim Segovia.

Revisiones concretas en borrador: [Backend #239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239) y [SPECS #15](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/15). Sin merge, aprobación ni cierre automático. Commits de implementación: favoritos `8017739`, CSAT/pruebas `1ce075e`.

## Qué está implementado

- F-036/F-038 reutilizan alta y eliminación propias, unicidad y validación del catálogo. Se rechazan queries de selección de dueño y cuerpos de DELETE. Undo usa un alta nueva y revalida elegibilidad; no recupera la fecha anterior.
- F-037 conserva orden `createdAt DESC,id DESC`, no-store, lista vacía confirmada y favoritos retirados. El adaptador G6 nuevo obtiene detalle, marca, precio vigente y disponibilidad comercial sin persistir catálogo externo.
- F-039 conserva `POST /api/v1/wishlist/items/{productId}/add-to-cart`: cada acción explícita suma una unidad y conserva favorito/createdAt. Reutiliza transacción y bloqueo del carrito; errores no dejan escrituras parciales. No se agregó `move-to-cart`. La spec revisada en SPECS requiere revisión independiente.
- F-040 agrega `POST /api/v1/orders/{orderId}/csat`: identidad compartida G7, prompt propio SHOWN, pedido propio ENTREGADO, GOOD/REGULAR/BAD → 5/3/1. Ventas guarda CSAT; G1 sólo actualiza PostDeliveryPrompt tras confirmación 201 o duplicado canónico 409. Un timeout/fallo incierto conserva estado y no dispara retry.
- Se mantienen pendientes las operaciones de creación/visualización/dismiss del prompt hasta definir G-PROMPT. No hay endpoints ni transiciones supuestos. El servicio rechaza ELIGIBLE/DISMISSED; SHOWN lo debe producir un flujo autorizado futuro.

## Configuración y condiciones para integración REAL

La configuración de ejemplo deja las capacidades nuevas apagadas. Los flags registran una decisión operativa, no demuestran integración.

**Favoritos G6:** `WISHLIST_SOURCE=real`, `WISHLIST_G6_APPROVED=true`, `WISHLIST_G6_REVISION=599c34f4e677c8792532e2cc31ac372473a10710`. Requiere `PRODUCTOS_BASE_URL` como origen HTTPS, `PRODUCTOS_SERVICE_TOKEN` privado con grants propios G1, `PRODUCTOS_TIMEOUT_MS` entre 100 y 5000 y allowlist `PRODUCTOS_MEDIA_HOSTS`. No se reenvía identidad humana a G6. Desactivar identidad sandbox; no hay fallback a fixtures en modo real.

La adición requiere además `WISHLIST_G6_QUANTITY_APPROVED=true` y `WISHLIST_FULFILLMENT_REF` opaco aprobado para ENVIO_DOMICILIO del canal. Sin esa referencia no se inventa ubicación ni se infiere cantidad desde DISPONIBLE/STOCK_BAJO. La consulta devuelve `binding=false`: no reserva inventario.

Fuente: [OpenAPI G6 fijado](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/599c34f4e677c8792532e2cc31ac372473a10710/contratos/http/openapi.yaml), versión 0.6.0-rc.1. Usa `/api/v1/productos/{id}`, `/precios/skus/{sku}`, disponibilidad comercial GET y verificación POST. No se cambia el pin del adaptador histórico del catálogo. Variantes muestran el mínimo de los precios autorizados; no se elige un SKU arbitrario. INDETERMINADO/malformado/fallo produce 503, no agotado ni vacío.

**CSAT:** activar sólo después de homologar I-03/I-04/G-PROMPT y acordar un productor legítimo de prompts SHOWN. Requiere `CSAT_ENABLED=true`, `CSAT_INTEGRATION_APPROVED=true`, `CSAT_PROMPT_APPROVED=true`, `CSAT_SALES_BASE_URL` y `CSAT_POSTVENTA_BASE_URL` como orígenes HTTPS. Se transporta únicamente el JWT humano validado; G5 vuelve a validar titularidad. La identidad técnica no sustituye al comprador. Las URLs HTTP loopback se admiten sólo fuera de producción.

Entrada: sentimiento obligatorio, hasta 10 motivos únicos en MAYUSCULAS_CON_GUIONES_BAJOS (máximo 50 caracteres por motivo), comentario opcional hasta 1000 caracteres sin controles. No se aceptan clienteId, canal ni puntuación elegidos por el navegador. Motivos/comentario se traducen a texto legible para G5; no se guardan en PostDeliveryPrompt ni se registran en logs.

## Entregas y revisiones

| Entrega | Resultado de este corte | Revisión / pendiente concreto |
|---|---|---|
| E0 | Rama desde baseline vigente, archivo local preservado, SWC diagnosticado, matriz 28 y cambio F-039 preparado | Fernando: contrato conservar favorito; Jim: trazabilidad. |
| E1 | PostgreSQL 16 desechable, cadena de 4 migraciones y redeploy probados; guard G7 reutilizado | Historial/esquema de nube sigue fuera de alcance; revisión de #204 por sus responsables. |
| E2 | Alta/idempotencia/ownership y adaptador de elegibilidad preparados | G-AUTH/I-01, grants y positivo/negativo/timeout REAL. |
| E3 | Proyección comercial y retirado/vacío/error probados localmente | Revisar proyección/precio mínimo de variantes y proveedor desplegado. |
| E4 | Quitar y restaurar con nueva identidad/fecha probados | Validación frontend/UX de G-UNDO en despliegue. |
| E5 | Conservar favorito, stock, variantes, concurrencia y rollback probados | Aceptar cambio de spec y volver a comprobar dependencia #86 con evidencia REAL. |
| E6 | Matrices y casos preparados; revisión estática del consumidor frontend usa add-to-cart | Integración conjunta, UI desplegada, trazas, DAST y revisión independiente pendientes. |
| E7 | CSAT y persistencia local probados; reestimación preliminar registrada | Confirmar datos de equipo/eventos/carga para #219. |
| E8 | Adaptadores preparados y apagados | I-03/I-04/G-PROMPT, proveedor efectivo y validación REAL/despliegue pendientes. |

Cada entrega se revisa al terminar; dividir bloques mayores de dos sesiones. Mantener una única entrega en implementación y otra en revisión. Balance semanal al retomar trabajo, sin automatización creada: revisar avance, hallazgos, gates y estimación restante. No cerrar tareas por completar un prototipo.

Plantilla por revisión: objetivo/issues → cambios y SHA → comandos/entorno/resultados → separación diseñado/local/REAL/despliegue → hallazgos/retest → veredicto del revisor → siguiente entrega. Si el revisor participó en la implementación, pedir otra revisión independiente. No se enviaron mensajes ni solicitudes de revisión a personas.

## Reproducir y revisar

```text
npm ci --no-audit --no-fund
npm run build
npm run typecheck
npm test
npm run test:diego:isolated
npm run docs:openapi
```

El ejecutor aislado crea un contenedor propio `postgres:16-alpine`, puerto efímero sólo loopback, contraseña sintética y sin volúmenes. Prueba migraciones (no db push), integración y sesiones G7 en dos bases de pruebas; elimina únicamente su contenedor al terminar. No acepta una URL de base compartida. En Codex Windows, SWC necesitó ejecución fuera del sandbox para materializar su caché nativa; no se cambió Jest ni el lockfile por este problema.

Evidencias: [resultados](evidencias/H4/diego/EVIDENCIA.md), [28 issues](evidencias/H4/diego/matriz-issues.md), [40 funciones](evidencias/H4/diego/seguimiento-h4.md), [reestimación](evidencias/H4/diego/reestimacion.md). El snapshot de estados GitHub no es un veredicto de QA. No hay prueba REAL externa ni despliegue acreditados en esta entrega.
