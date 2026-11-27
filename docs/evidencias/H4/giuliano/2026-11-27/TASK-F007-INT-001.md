# TASK-F007-INT-001 — búsqueda positiva REAL, retest acotado

Fecha: 2026-11-27 (UTC). #49 permanece abierta y Bloqueada.

## Estado y dependencias

- Preflight GitHub: Backend #49 `open` / origen `Bloqueado`; Backend #48 `closed`; OPS/I-01 #200 `closed`; Backend F-006 INT #45 `open` / `Bloqueado`. No se modificaron otras issues.
- #49 permite probar casos independientes sin esperar el ranking G5. Este retest cubre únicamente la búsqueda positiva de los dos homónimos. La relación formal con #45 y los criterios restantes siguen pendientes; no se cierra #49.

## Runtime y corte

- En la consulta Render de despliegues, el servicio `g1-marketplace-backend` mostraba el deploy `dep-dc4q1ue0tbcc73der13g` como `live`, SHA `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f` (árbol `028fdea911652a08b7d59de0eb882b8e47fef0cb`). Dos intentos posteriores de desplegar `9ab5d4364f6db22a7691f08a62f9214d0556843b` figuraban `update_failed`; el SHA live observado sigue siendo `ab4ffca`.
- El release [#424, SHA `09b3a58`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/09b3a58a888178db0e56920b281970b4ecd75643) es ancestro de `ab4ffca`, pero no es el SHA live. No hay cambios bajo `src/catalog` entre esos dos commits. La verificación de despliegue es de lectura; no se dispararon despliegues.
- En el código live, `src/catalog/query.ts` acepta los parámetros BFF `q`, `sort`, `page` y `pageSize`. `src/catalog/provider.ts` traduce `page=0` a `pagina=1`, `pageSize=2` a `tamanio=2` y `sort=NAME_ASC` a `orden=NOMBRE_ASC` para G6; también envía `canal=MARKETPLACE`. No se accedió a G6 directamente ni se usó ningún token.

## Una prueba positiva al BFF

Se hizo una sola petición GET al endpoint oficial de Render:

```text
https://g1-marketplace-backend.onrender.com/api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&sort=NAME_ASC&page=0&pageSize=2
```

Respuesta a `2026-11-27T16:18:35Z`: HTTP 200, `X-Catalog-Source: REAL`, `X-Request-Id: ebb4fb1a-acb3-47f2-8176-504ed193a8d9`. La respuesta indica `sort=NAME_ASC`, página `0`, tamaño `2`, total `2` y estos productos, en este orden:

1. ID `8ad24563-c9da-4305-b650-1dd47a14fffb`, slug `g6-qa-marketplace-ord-002`, nombre `G6 QA Marketplace Desempate`.
2. ID `93f7f500-077d-432e-be98-31cb9ee0d66d`, slug `g6-qa-marketplace-ord-001`, nombre `G6 QA Marketplace Desempate`.

El orden coincide con el desempate ID ascendente solicitado por G6. La respuesta pública del BFF no contiene precios ni un `X-Correlation-Id` de G6; el `X-Request-Id` registrado pertenece al BFF. No se atribuye correlación de extremo a extremo que la respuesta no expone.

| Alcance de esta tarea | Resultado |
| --- | --- |
| Búsqueda positiva exacta de homónimos, orden por nombre ascendente y página 0/tamaño 2 en BFF REAL | **PASS** |
| Búsqueda vacía, límites/negativos, error/timeout REAL o interacción UI en este retest | **NOT RUN** |
| Cierre de #49 | **BLOCKED** por dependencia formal #45 y criterios/aceptación restantes |

## Procedimiento y límites

- Checkout principal conservado. Worktree aislado: `/tmp/G1-Marketplace-Backend-integration-f007-20261127`, rama `integration/giuliano-f007-20261127`, basada en el SHA live `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f`.
- Comprobaciones de corte: `git merge-base --is-ancestor 09b3a58a888178db0e56920b281970b4ecd75643 ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f` y `git diff --name-status 09b3a58a888178db0e56920b281970b4ecd75643..ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f -- src/catalog` (sin diferencias).
- Única lectura: `curl --silent --show-error --max-time 20 --connect-timeout 5 --max-redirs 0 --retry 0 --include 'https://g1-marketplace-backend.onrender.com/api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&sort=NAME_ASC&page=0&pageSize=2'`.
- No se ejecutó la matriz completa de F-007 ni se hicieron reintentos, llamadas directas a G6 o lecturas/escrituras de secretos/configuración de entorno.

Este artefacto acredita sólo el positivo independiente en BFF REAL descrito arriba. La issue #49 continúa `open`/`Bloqueado`; #45, #48 y #200 no se modificaron.
