# H5 · Evidencia asíncrona (#314, #315 y #394)

Conciliación de la ronda del 26/11/2026 a partir de GitHub, sin nueva ejecución. **REAL** corresponde al flujo de integración observado o reportado, con su alcance explícito. **LAB LOCAL** usa infraestructura aislada y datos sintéticos. **MOCK/OFFLINE** usa dobles, pruebas en memoria o comprobaciones estáticas; señalar los dobles aunque la prueba use una base real desechable. **NOT_RUN** indica que no se acredita una ejecución para el caso y entorno indicados. Un merge acredita incorporación a `develop`, no despliegue ni ejecución REAL.

## A · Seguridad (G7) → RabbitMQ cloud → Marketplace QA

Fuentes: [resultado final de #314][real314] y [resultado final de #315][real315]. El consumidor del ensayo se ejecutó como un único proceso con el fix, conectado al broker cloud y a PostgreSQL QA; esto no acredita un despliegue administrado del consumidor. Horas de Lima (UTC−5).

| Caso | Evidencia y resultado del 26/11 |
|---|---|
| Descarte directo | **REAL.** Seis mensajes previos con timestamp `fecha` UTC de 6 o 9 decimales fueron rechazados una vez cada uno desde `marketplace.usuarios` (`x-death.reason=rejected`, `count=1`) y enviados directamente a DLQ por validación. El parser anterior exigía exactamente 3 decimales. No hubo paso por retry ni agotamiento de reintentos. |
| Corrección | [PR #409][pr409] fusionado en `769e3b7`: admite timestamps UTC con `Z` y entre 0 y 9 dígitos fraccionarios, sin alterar el valor original ni relajar las demás validaciones. El primer lote usó el commit de la corrección `20cdb57`; el consumidor para la nueva entrega usó `769e3b7`. |
| Recuperación manual desde DLQ | **REAL.** Dos lotes de 3 mensajes originales (18:26 y 18:57). La consulta de solo lectura en PostgreSQL QA confirmó una fila por `eventoId`: 6 filas y 6 IDs distintos para los recuperados. Los seis originales quedaron `Ready` en DLQ; no se republicaron ni se purgó la cola. Preservar la DLQ; este registro no autoriza leerla consumiendo mensajes, reencolar, republicar ni purgar. |
| Publicación y entrega automática | **REAL.** G7 confirmó que publicó un nuevo `usuario.creado` v1 a las 18:50:05; el consumidor lo registró a las 18:50:08.096 (23:50:08.096 UTC). El cotejo por ID en PostgreSQL QA confirmó una fila nueva. Total al final: **8 filas / 8 IDs únicos** (1 prueba inicial + 6 recuperaciones manuales + 1 entrega automática nueva). |

Los descartes de bloqueo y cambio de roles se recuperaron solo en el inbox; no acreditan las reacciones de [#316][pr389]. El campo `hasta` fue nulo en el bloqueo REAL; la variante con 6 dígitos fraccionarios solo se probó con un caso sintético (**MOCK/OFFLINE**).

| Caso de resiliencia | Evidencia separada | Gate del broker compartido |
|---|---|---|
| Duplicado de un `eventoId` ya persistido | **LAB LOCAL.** Dos entregas del mismo evento sintético y una sola fila en [#317, `5991457`][lab317]. | **NOT_RUN** para redelivery automática del mismo ID. Los conteos de la ronda REAL no prueban una segunda entrega sin segunda fila ni efectos repetidos. |
| Backoff y DLQ tras agotar reintentos | **LAB LOCAL.** Ensayo del candidato `7a75c1c` citado en [SPECS #24][spec24]: 1005/2006/4006 ms y descarte tras agotar intentos. | **NOT_RUN** para la secuencia automática 1/2/4 s y DLQ por agotamiento. El rechazo directo y la recuperación manual no son reintentos automáticos. |
| Caída, acumulación y recuperación | **LAB LOCAL.** En [#317, `5991457`][lab317] se cortó la conexión del consumidor con RabbitMQ 4.1/PostgreSQL 16 aislados: dos entregas acumuladas, una reconexión, cola drenada y una fila. No se detuvo el broker completo. El [PR #390][pr390] (`f50938b`) agrega observabilidad y pruebas de recuperación con AMQP simulado, incluida una integración con PostgreSQL 16 desechable. | **NOT_RUN** para caída/recuperación en el broker compartido. Una reconexión de laboratorio o un replay manual no acreditan ese gate. |

**#314:** hay evidencia REAL del criterio de recepción y persistencia de un evento de G7 en QA, pendiente de revisión independiente. **#315:** hay evidencia parcial REAL (descarte directo y recuperación manual con unicidad), pero faltan redelivery automática del duplicado, backoff y DLQ por agotamiento. [PR #389][pr389] (`9b2280d`, reacciones) y [PR #390][pr390] (`f50938b`, resiliencia) están fusionados; no sustituyen una prueba de fallo/recuperación en el broker compartido. Revisión recomendada: **Diego** para #314/#315.

## B · Ventas → webhook Marketplace (#394, tramo asíncrono)

| Caso | Evidencia y límite |
|---|---|
| Receptor desplegado, 26/11 | **REAL histórico, separado de #399.** [#318][real318] reporta siete eventos de ejemplo aceptados desde Ventas, siete filas únicas, `401` sin token o con token incorrecto y reintento de Ventas tras un timeout de arranque en frío. No acredita intervalos de backoff, fallo controlado ni recuperación de una caída. |
| Duplicado, rechazo y fallo transitorio | [PR #399][pr399] fusionado en `3dc4857`: [E2E del receptor][lab399], **MOCK/OFFLINE** con inbox en memoria para duplicado y rechazos; **LAB LOCAL/CI** con PostgreSQL 16 desechable y fallo de escritura simulado para `503` sin fila y reintento `200` con una fila. No fue una entrega REAL de Ventas al receptor desplegado. |
| Aceptación intermodular con correlación | **NOT_RUN** para la [prueba coordinada de #320][plan320]: falta una traza del mismo evento entre Despacho, Ventas y Marketplace, con los intentos correlacionados, el `503` controlado y reintento `200` con una sola fila. Los siete eventos únicos de #318 no demuestran una segunda entrega correlacionada. |

Para [#394][issue394] quedan pendientes esos casos integrados y las [pruebas APIM por política](../apim/README.md). Revisión recomendada: **Jim** para #394.

[real314]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/314#issuecomment-7206107498
[real315]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/315#issuecomment-7206107831
[pr389]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/389
[pr390]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/390
[pr399]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/399
[pr409]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/409
[lab317]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/317#issuecomment-7203197884
[lab399]: ../diego/TASK-H5-ASYNC-008-WEBHOOK-E2E.md#2-casos-e2e-del-receptor
[real318]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/318#issuecomment-7202913749
[plan320]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/320#issuecomment-7206454730
[spec24]: https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/9019869c427669049ce8796de36501d8c52affef/plan/H5-PUNTO-4-EVIDENCIA.md
[issue394]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/394
