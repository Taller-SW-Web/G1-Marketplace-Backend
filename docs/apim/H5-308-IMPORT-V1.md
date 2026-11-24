# H5-308 - OpenAPI APIM `/v1`

## Estado y alcance

El prerequisite #307 esta cerrado: se verifico en modo lectura el comentario de cierre de GitHub del 23/nov, que confirma que APIM Consumption esta Online. Esta tarea avanzo solo artefactos locales; no se consulto ni modifico Azure, no se usaron credenciales ni se llamaron servicios de negocio.

El archivo [`marketplace-bff-v1.subset.openapi.yaml`](./marketplace-bff-v1.subset.openapi.yaml) es un candidato importable que contiene **un subconjunto contratado de exactamente 33 operaciones del BFF**, derivadas de las cinco fuentes indicadas abajo. **No es el contrato completo del BFF.** No declara `servers`, host backend ni URL de servicio.

## Fuentes

- `docs/contratos/auth-h4.openapi.yaml`
- `docs/contratos/checkout-h4.openapi.yaml`
- `docs/contratos/openapi-catalogo-h4.json`
- `docs/contratos/openapi-h3.json`
- `docs/contratos/product-detail-h4.openapi.yaml`

El unico cambio de ruta es quitar `/api` del prefijo de las 33 operaciones documentadas (`/api/v1/...` -> `/v1/...`). Metodos, descripciones, payloads, respuestas/errores, esquemas y referencias se conservan. Los nombres de componentes en colision se califican por dominio y solo se reescriben los `$ref` que apuntaban a esos nombres, para evitar sobrescribir definiciones distintas al consolidar. La seguridad global Bearer de Checkout se materializa en cada operacion Checkout para que no se herede accidentalmente en otros dominios; su catalogo `x-security-errors` tambien se conserva con namespace de fuente.

## Exclusiones y bloqueos explicitos

- `GET /health` existe en `openapi-h3.json`, pero no empieza por `/api/v1`; no se publica como `/v1/health`.
- No se incluyen estas cuatro rutas implementadas sin operacion OpenAPI en las cinco fuentes:
  - `GET /api/v1/orders/me`
  - `DELETE /api/v1/carts/current/items/{sku}`
  - `POST /api/v1/carts/current/merge-anonymous`
  - `POST /api/v1/carts/current/items/{sku}/move-to-wishlist`
- El artefacto no incorpora alias no documentados, no define backend ni configura la traduccion APIM `/v1` -> BFF `/api/v1`.

## Candidato offline de encaminamiento

Se preparó [`v1-backend-rewrite.policy.xml`](./v1-backend-rewrite.policy.xml) como candidato para aplicar **sólo al API `marketplace-api` con sufijo público `/v1`**, y únicamente si su `serviceUrl` apunta al origen del backend sin un prefijo de path. La expresión toma la ruta pública original y añade `/api`, por lo que `/v1/catalog/products` se convierte en `/api/v1/catalog/products`; los parámetros de query no coincidentes se conservan.

No se añadió a `azure-apim/policies/api-policy.xml` ni al workflow de despliegue: ese workflow publica cambios de `azure-apim/**` en `develop`, y este rewrite necesita confirmar el API/backend destino antes de ejecutarse. Si el `serviceUrl` ya incluye `/api`, no aplicar el candidato porque duplicaría el prefijo. La sintaxis de `rewrite-uri` y las expresiones está basada en la [referencia oficial de Microsoft](https://learn.microsoft.com/en-us/azure/api-management/rewrite-uri-policy), pero no se ejecutó ni validó en un gateway APIM.

## Generacion y validacion offline

```bash
npm run build:apim:v1
npm run check:apim:v1
npm run check:apim:v1:rewrite
```

La generacion y los checkers usan Node.js y los contratos/artefactos locales. El checker de superficie valida estructura/rutas, que solo cambie el prefijo de las rutas publicadas, `$ref` locales resolubles, las cuatro rutas bloqueadas y la exclusion de `/health`. El checker de rewrite inspecciona la policy candidata y comprueba el mapeo de ejemplo; no ejecuta expresiones C# de APIM. Tras integrar el `develop` actualizado, `npm run build:apim:v1` regeneró el artefacto; `npm run check:apim:v1` encontró 32 paths, 33 operaciones, 303 `$ref` locales resolubles y los cuatro bloqueos; `npm run check:apim:v1:rewrite` validó la propuesta estática para los 32 paths; y `swagger-cli validate docs/apim/marketplace-bff-v1.subset.openapi.yaml` validó el YAML regenerado. Para swagger-cli se reutilizaron dependencias ya instaladas localmente en el worktree #304; no se instalaron paquetes en esta rama. Ningún comando importa ni despliega el API.

Antes de una importacion real aun debe confirmarse el `serviceUrl`, revisar la policy candidata con el responsable de APIM, validarla en un entorno no productivo y probar request/response/query-string de las operaciones. Este archivo no certifica el encaminamiento ni que las rutas bloqueadas formen parte del contrato.
