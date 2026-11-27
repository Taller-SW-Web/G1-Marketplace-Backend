# TASK-F010-INT-001 — gate previo a lectura directa de APIM

**Fecha:** 2026-11-27 UTC
**Issue:** [Backend #61](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/61), que permanece `open / Bloqueado`.

## Corte observado

La lista de despliegues de Render mostró el Backend `ab4ffca8ce20eabd3b3f716289b8df1d16ae7c7f` como `live` a las 17:43:43 UTC. Esta referencia sólo identifica el corte Backend consultado; la autenticación fallida fue una solicitud directa a G7 y no pasó por el BFF. No se atribuye a ese SHA una configuración de APIM ni un resultado de catálogo.

## Resultado sanitizado de G7

- Hora UTC de inicio: `2026-11-27T17:43:47.148Z`.
- Método/ruta: un POST a `https://g7-auth-service.onrender.com/api/v1/auth/token`.
- Estado: **HTTP 401**, código sanitizado `CLIENTE_INVALIDO`.
- No hubo reintento. La credencial `PRODUCTOS_CLIENT_SECRET` se leyó en memoria desde el archivo autorizado y no se imprimió ni guardó. No se incluyen token, secreto ni cuerpo de respuesta.
- Al no recibirse un token HTTP 200, no hubo claims que comprobar y no se hizo la petición APIM.

## APIM y alcance

**No se ejecutó** el GET a `https://apim-g6-productos-chile.azure-api.net/api/v1/productos?canal=MARKETPLACE&pagina=1&tamanio=5`. No hubo respuesta APIM, status, código, `X-Correlation-Id` ni productos disponibles en esta ejecución. Tampoco se usó `Ocp-Apim-Subscription-Key`.

La lectura directa prevista habría sido distinta de la evidencia BFF previa de paginación, conservada en [commit `c56527b`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/c56527b6b8fb93a5d0f05230a77b6719c9ebf9d2). Este registro no añade una validación REAL de APIM ni sustituye aquella evidencia.

## Dependencias y estado

BE #60 y OPS/I-01 #200 están cerradas. BE [#49](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/49) sigue `open / Bloqueado`; esta autenticación fallida no modifica esa dependencia. #61 continúa `open / Bloqueado`, con sus dependencias, labels y DoD intactos.

No se inspeccionaron buzones, no se emitieron eventos y no se llamaron endpoints de catálogo después del rechazo de token. No se consultaron logs de APIM: no hubo una solicitud APIM ni correlación para localizar. No se atribuye causa al `CLIENTE_INVALIDO`.
