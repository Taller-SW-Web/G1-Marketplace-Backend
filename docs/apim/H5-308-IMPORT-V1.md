# H5-308 - OpenAPI APIM `/v1`

## Estado y alcance

El prerequisite #307 esta cerrado: se verifico en modo lectura el comentario de cierre de GitHub del 23/nov, que confirma que APIM Consumption esta Online. El responsable de APIM confirmó por escrito los siguientes datos de destino. Los artefactos de esta PR no se desplegaron ni se importaron por esta rama. La evidencia de un smoke posterior realizado desde la PR #349 se registra abajo y no demuestra la importación o disponibilidad de las 34 operaciones.

| Configuración confirmada | Valor |
| --- | --- |
| Instancia / grupo / región / plan | `apim-g1-marketplace-20` / `rg-marketplace-g1` / West US / Consumption |
| API ID / sufijo | `marketplace-api` / `v1` |
| Gateway público | `https://apim-g1-marketplace-20.azure-api.net/v1` |
| `serviceUrl` backend | `https://g1-marketplace-backend.onrender.com` (origen, sin prefijo de ruta) |

El archivo [`marketplace-bff-v1.subset.openapi.yaml`](./marketplace-bff-v1.subset.openapi.yaml) es un candidato importable que contiene **un subconjunto contratado de exactamente 34 operaciones del BFF**, derivadas de las cinco fuentes indicadas abajo. **No es el contrato completo del BFF.** No declara `servers` ni incorpora el host backend: el `serviceUrl` confirmado se configura por separado en APIM y no queda validado por este artefacto.

## Fuentes

- `docs/contratos/auth-h4.openapi.yaml`
- `docs/contratos/checkout-h4.openapi.yaml`
- `docs/contratos/openapi-catalogo-h4.json`
- `docs/contratos/openapi-h3.json`
- `docs/contratos/product-detail-h4.openapi.yaml`

El unico cambio de ruta es quitar `/api` del prefijo de las 34 operaciones documentadas (`/api/v1/...` -> `/v1/...`). Metodos, descripciones, payloads, respuestas/errores, esquemas y referencias se conservan. Los nombres de componentes en colision se califican por dominio y solo se reescriben los `$ref` que apuntaban a esos nombres, para evitar sobrescribir definiciones distintas al consolidar. La seguridad global Bearer de Checkout se materializa en cada operacion Checkout para que no se herede accidentalmente en otros dominios; su catalogo `x-security-errors` tambien se conserva con namespace de fuente.

## Exclusiones y bloqueos explicitos

- `GET /health` existe en `openapi-h3.json`, pero no empieza por `/api/v1`; no se publica como `/v1/health`. `/docs` y `/docs/specs/*` también quedan fuera del subconjunto. No agregar rutas `/v1/health` o `/v1/docs` ni encaminarlas con este rewrite sin acordar y aprobar primero su exposición.
- No se incluyen estas cuatro rutas implementadas sin operacion OpenAPI en las cinco fuentes:
  - `GET /api/v1/orders/me`
  - `DELETE /api/v1/carts/current/items/{sku}`
  - `POST /api/v1/carts/current/merge-anonymous`
  - `POST /api/v1/carts/current/items/{sku}/move-to-wishlist`
- Seguimiento para ampliar la superficie: los responsables de Checkout y Pedidos deben añadir estas operaciones a sus contratos OpenAPI fuente y revisarlas en sus respectivos cambios. Después se regenera el subset. No se inventan esquemas ni se exponen aquí rutas sin contrato; estas exclusiones son deliberadas y el artefacto no representa la cobertura completa del BFF.
- El artefacto no incorpora alias no documentados, no define backend ni configura la traduccion APIM `/v1` -> BFF `/api/v1`.

## Candidato offline de encaminamiento

Se preparó [`v1-backend-rewrite.policy.xml`](./v1-backend-rewrite.policy.xml) como candidato para el API confirmado `marketplace-api`, con sufijo público `/v1` y `serviceUrl` en el origen confirmado. Debe aplicarse únicamente al API importado con este subconjunto de 34 operaciones: añade `/api` a las rutas públicas y conserva parámetros de query no coincidentes. Así, `/v1/catalog/products?page=0&pageSize=10` se convierte en `/api/v1/catalog/products?page=0&pageSize=10`. No es un mapeo de `/v1/health` o `/v1/docs`; esas rutas no forman parte del API importado.

Este archivo candidato no se añadió a `azure-apim/policies/api-policy.xml` ni al workflow de despliegue, y esta PR no lo aplicó a Azure. El responsable APIM informó después que aplicó una configuración de routing/rewrite y sincronización de headers en el commit `df137b1` (PR #359). Esa configuración externa no convierte este XML candidato en desplegado ni valida las 34 operaciones. Si el `serviceUrl` cambia o ya incluye `/api`, no aplicar el candidato hasta revisar el mapeo porque duplicaría el prefijo. La sintaxis de `rewrite-uri` y las expresiones está basada en la [referencia oficial de Microsoft](https://learn.microsoft.com/en-us/azure/api-management/rewrite-uri-policy).

## Casos de validación y evidencia limitada de gateway

- `GET /v1/catalog/products?page=0&pageSize=10` → `GET /api/v1/catalog/products?page=0&pageSize=10`; `pageSize` es el parámetro contratado, no `size`. Un `200` depende de la disponibilidad y datos del entorno.
- `GET /v1/carts/current` permite sesión anónima según el contrato; no usarlo como caso esperado de `401`. `/v1/carts` no es una operación del subconjunto.
- Para validar rechazo sin JWT, usar `GET /v1/wishlist`, operación contratada que requiere Bearer y documenta `401`.
- `GET /v1/health` → `200` queda pendiente de decisión contractual y configuración específica. Actualmente no hay operación `/v1/health`; el rewrite genérico lo convertiría incorrectamente en `/api/v1/health` mientras el backend publica `/health` en la raíz. `/docs` también permanece fuera del subconjunto.

El smoke manual [45536575477](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45536575477), ejecutado desde la PR #349 tras la confirmación del responsable APIM, cubrió el catálogo y wishlist: catálogo devolvió `503` (esperado `200`) y wishlist sin JWT devolvió `401` (esperado `401`); ambos headers de correlación coincidieron. El responsable atribuyó el `503` a `CATALOG_UNAVAILABLE` de G6; el smoke no registró el body, así que esa causa es reportada por el responsable. Esto evidencia respuestas para dos rutas, no la importación ni el funcionamiento de toda la superficie de 34 operaciones. No hubo carga ni despliegue desde esta PR.

## Generacion y validacion offline

```bash
npm run build:apim:v1
npm run check:apim:v1
npm run check:apim:v1:rewrite
```

La generacion y los checkers usan Node.js y los contratos/artefactos locales y ahora se incluyen al inicio de `npm test`. El checker de superficie valida estructura/rutas, que solo cambie el prefijo de las rutas publicadas, `$ref` locales resolubles, las cuatro rutas bloqueadas y la exclusion de `/health`. El checker de rewrite inspecciona la policy candidata y comprueba el mapeo de ejemplo; no ejecuta expresiones C# de APIM. La validación encontró 33 paths, 34 operaciones, 310 `$ref` locales resolubles y los cuatro bloqueos; no valida la importación del subset en gateway ni la disponibilidad de todas sus operaciones.

Antes de importar este subset o modificar policies se requiere autorización expresa y revisión con el responsable APIM. La smoke separada no valida este candidato ni cubre las 34 operaciones; no se ejecutaron pruebas de carga. Este archivo no certifica que las rutas excluidas o bloqueadas formen parte del contrato.
