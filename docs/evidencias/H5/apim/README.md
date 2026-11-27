# H5 · Matriz de evidencia APIM (#394)

**Estado de la nueva corrida: NOT_RUN.** La [última coordinación de #394][ventana] propone el viernes **27/11/2026, 10:00–10:30 Lima (15:00–15:30 UTC)** y sustituye la propuesta de inicio a las 10:30 Lima. Antes de cualquier tráfico, confirmar con Andrés y Diego la autorización de la ventana, la suscripción QA por canal privado, la revisión activa que atiende `/v1` y el SHA y acceso a los logs del BFF para el cotejo. La agenda no es una autorización ni una prueba. No publicar valores, nombres o IDs de suscripciones, credenciales, payloads ni PII.

## Conflicto con el subset contratado (#308)

La [propuesta de #394][ventana] menciona `/v1/docs` para caché y la [matriz preliminar de SPECS #24][spec24] propone `/v1/docs/specs` para caché y `/v1/health` para rate limit. El [subset contratado de #308 (PR #348)][subset] excluye esas rutas y sus subrutas. Que el [XML versionado de #359][policy] contenga condiciones para health/docs no publica esas operaciones, no prueba que esa policy esté activa ni autoriza tráfico por ellas. **No usar, importar ni habilitar las rutas excluidas.** No hay ruta de caché alternativa aprobada: dejar HIT/MISS **NOT_RUN** hasta que se acuerde una prueba dentro del contrato y se autorice expresamente. `Cache-Control: no-store` en catálogo no demuestra un HIT ni un MISS.

## Política → prueba → resultado

| Política o comprobación | Caso de aceptación (no ejecutado en esta actualización) | Resultado y evidencia |
|---|---|---|
| JWT (G7) | En una operación protegida del subset (`GET /v1/wishlist`), cotejar `401` sin JWT y con JWT inválido contra la revisión activa. | **REAL histórico:** `401` sin JWT a las 02:57:35.767 UTC del 25/11 ([smoke #349][smoke]). La repetición con revisión confirmada y el caso con JWT inválido quedan **NOT_RUN**. |
| Rate limit | Obtener `429` con `Retry-After` en una operación contratada acordada con el responsable, dentro de un presupuesto de solicitudes autorizado. | **NOT_RUN** para #394. El smoke histórico no lo ejercitó. La ruta propuesta `/v1/health` está excluida; no sustituirla sin acuerdo. |
| Caché Redis | Acreditar `X-Cache: MISS` y después `HIT` con una ruta cacheable contratada y aprobada. | **NOT_RUN.** Sin ruta elegible aprobada. Los HIT/MISS referidos en [SPECS #24][spec24] carecen de traza adjunta y no se aceptan como evidencia del subset ni del catálogo. |
| Correlación APIM → BFF | Comparar el `X-Correlation-Id` generado al no aportar ID de entrada con la respuesta y el log sanitizado del BFF del mismo intento. | **REAL histórico parcial:** [smoke #349][smoke] observó cabeceras de salida sincronizadas con ID de entrada; catálogo dio `503` a las 02:57:35.633 UTC del 25/11. Generación y cotejo con log del BFF **NOT_RUN**. |
| Rutas `/v1` y separación de suscripciones | Verificar operaciones contratadas en la revisión activa y confirmar separación entre FE y consumidores externos sin divulgar detalles. | **NOT_RUN** para la corrida de aceptación. El `503` de catálogo y el `401` de wishlist históricos solo acreditan dos respuestas del gateway, no la importación ni disponibilidad del subset completo ni la separación de suscripciones. |
| CORS (runbook #309) | Si se incluye en la ventana autorizada, cotejar las cabeceras CORS desde el origen FE permitido sobre una operación contratada. | **NOT_RUN.** La policy en Git no demuestra el comportamiento de CORS en la revisión activa. |

## Evidencia pendiente de la revisión efectiva

El XML de `b45c608` en Git es una referencia **MOCK/OFFLINE** para comparación estática, no un export de Azure ni un resultado de ejecución. El [export de solo lectura solicitado][export] sigue **NOT_RUN**: el responsable debe confirmar la revisión activa y los ámbitos aplicables (API, heredados y overrides de operación), fecha UTC y ETag si está disponible. Guardar solo XML sanitizado sin resolver Named Values; no aplicar cambios. Para cada prueba futura, guardar entorno, hora UTC, método/ruta, estado HTTP, cabeceras pertinentes sanitizadas, referencia de traza y revisión APIM/SHA BFF. Si falta autorización o no se ejecuta un caso, conservar **NOT_RUN**.

La [matriz asíncrona](../asincrono/README.md) cubre el otro tramo de #394. Revisión recomendada: **Jim**. No se hicieron solicitudes al gateway ni cambios de policy o de OpenAPI para esta actualización.

[ventana]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/394#issuecomment-7206334564
[export]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/394#issuecomment-7204663475
[subset]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/6cd707a456fee2a45c0eb027e05aebacc22fd39b/docs/apim/H5-308-IMPORT-V1.md#exclusiones-y-bloqueos-explicitos
[policy]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/b45c608/azure-apim/policies/api-policy.xml
[smoke]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45536575477/job/138944541668
[spec24]: https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/9019869c427669049ce8796de36501d8c52affef/plan/H5-PUNTO-4-EVIDENCIA.md
