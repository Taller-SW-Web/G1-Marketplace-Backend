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

## Generacion y validacion offline

```bash
npm run build:apim:v1
npm run check:apim:v1
```

La generacion usa solo Node.js y los cinco contratos locales. El checker valida estructura/rutas, que solo cambie el prefijo de las rutas publicadas, `$ref` locales resolubles, las cuatro rutas bloqueadas y la exclusion de `/health`. El 23/nov `npm run build:apim:v1` y `npm run check:apim:v1` pasaron; el checker encontro 32 paths, 33 operaciones y 303 `$ref` locales resolubles. Ademas, se parseo el YAML completo con `js-yaml` y `swagger-cli validate docs/apim/marketplace-bff-v1.subset.openapi.yaml` lo valido. Para estas dos comprobaciones se reutilizaron las dependencias ya instaladas en el worktree local #304; no se instalaron paquetes en esta rama. Ninguno de los comandos importa o despliega el API.

Antes de una importacion real aun debe coordinarse y probarse la politica de backend `/v1` -> `/api/v1` y definirse el backend en el entorno destino. Este archivo no certifica el encaminamiento ni que las rutas bloqueadas formen parte del contrato.
