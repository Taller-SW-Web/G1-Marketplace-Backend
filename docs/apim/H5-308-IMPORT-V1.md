# H5-308 - OpenAPI APIM `/v1`

## Estado y alcance

El prerequisite #307 esta cerrado: se verifico en modo lectura el comentario de cierre de GitHub del 23/nov, que confirma que APIM Consumption esta Online. El responsable de APIM confirmó por escrito los siguientes datos de destino; esta rama solo los registra y no consultó ni modificó Azure, no usó credenciales ni llamó servicios de negocio.

| Configuración confirmada | Valor |
| --- | --- |
| Instancia / grupo / región / plan | `apim-g1-marketplace-20` / `rg-marketplace-g1` / West US / Consumption |
| API ID / sufijo | `marketplace-api` / `v1` |
| Gateway público | `https://apim-g1-marketplace-20.azure-api.net/v1` |
| `serviceUrl` backend | `https://g1-marketplace-backend.onrender.com` (origen, sin prefijo de ruta) |

El archivo [`marketplace-bff-v1.subset.openapi.yaml`](./marketplace-bff-v1.subset.openapi.yaml) es un candidato importable que contiene **un subconjunto contratado de exactamente 33 operaciones del BFF**, derivadas de las cinco fuentes indicadas abajo. **No es el contrato completo del BFF.** No declara `servers` ni incorpora el host backend: el `serviceUrl` confirmado se configura por separado en APIM y no queda validado por este artefacto.

## Fuentes

- `docs/contratos/auth-h4.openapi.yaml`
- `docs/contratos/checkout-h4.openapi.yaml`
- `docs/contratos/openapi-catalogo-h4.json`
- `docs/contratos/openapi-h3.json`
- `docs/contratos/product-detail-h4.openapi.yaml`

El unico cambio de ruta es quitar `/api` del prefijo de las 33 operaciones documentadas (`/api/v1/...` -> `/v1/...`). Metodos, descripciones, payloads, respuestas/errores, esquemas y referencias se conservan. Los nombres de componentes en colision se califican por dominio y solo se reescriben los `$ref` que apuntaban a esos nombres, para evitar sobrescribir definiciones distintas al consolidar. La seguridad global Bearer de Checkout se materializa en cada operacion Checkout para que no se herede accidentalmente en otros dominios; su catalogo `x-security-errors` tambien se conserva con namespace de fuente.

## Exclusiones y bloqueos explicitos

- `GET /health` existe en `openapi-h3.json`, pero no empieza por `/api/v1`; no se publica como `/v1/health`. `/docs` y `/docs/specs/*` también quedan fuera del subconjunto. No agregar rutas `/v1/health` o `/v1/docs` ni encaminarlas con este rewrite sin acordar y aprobar primero su exposición.
- No se incluyen estas cuatro rutas implementadas sin operacion OpenAPI en las cinco fuentes:
  - `GET /api/v1/orders/me`
  - `DELETE /api/v1/carts/current/items/{sku}`
  - `POST /api/v1/carts/current/merge-anonymous`
  - `POST /api/v1/carts/current/items/{sku}/move-to-wishlist`
- El artefacto no incorpora alias no documentados, no define backend ni configura la traduccion APIM `/v1` -> BFF `/api/v1`.

## Candidato offline de encaminamiento

Se preparó [`v1-backend-rewrite.policy.xml`](./v1-backend-rewrite.policy.xml) como candidato para el API confirmado `marketplace-api`, con sufijo público `/v1` y `serviceUrl` en el origen confirmado. Debe aplicarse únicamente al API importado con este subconjunto de 33 operaciones: añade `/api` a las rutas públicas y conserva parámetros de query no coincidentes. Así, `/v1/catalog/products?page=0&pageSize=10` se convierte en `/api/v1/catalog/products?page=0&pageSize=10`. No es un mapeo de `/v1/health` o `/v1/docs`; esas rutas no forman parte del API importado.

No se añadió a `azure-apim/policies/api-policy.xml` ni al workflow de despliegue, y no se aplicó a Azure. Aunque el destino quedó confirmado por escrito, el rewrite sigue siendo candidato offline hasta revisión, autorización y validación no productiva. Si el `serviceUrl` cambia o ya incluye `/api`, no aplicar el candidato hasta revisar el mapeo porque duplicaría el prefijo. La sintaxis de `rewrite-uri` y las expresiones está basada en la [referencia oficial de Microsoft](https://learn.microsoft.com/en-us/azure/api-management/rewrite-uri-policy), pero no se ejecutó ni validó en un gateway APIM.

## Casos de validación propuestos (no ejecutados)

- `GET /v1/catalog/products?page=0&pageSize=10` → `GET /api/v1/catalog/products?page=0&pageSize=10`; `pageSize` es el parámetro contratado, no `size`. Un `200` depende de la disponibilidad y datos del entorno.
- `GET /v1/carts/current` permite sesión anónima según el contrato; no usarlo como caso esperado de `401`. `/v1/carts` no es una operación del subconjunto.
- Para validar rechazo sin JWT, usar `GET /v1/wishlist`, operación contratada que requiere Bearer y documenta `401`.
- `GET /v1/health` → `200` queda pendiente de decisión contractual y configuración específica. Actualmente no hay operación `/v1/health`; el rewrite genérico lo convertiría incorrectamente en `/api/v1/health` mientras el backend publica `/health` en la raíz. `/docs` también permanece fuera del subconjunto.

## Generacion y validacion offline

```bash
npm run build:apim:v1
npm run check:apim:v1
npm run check:apim:v1:rewrite
```

La generacion y los checkers usan Node.js y los contratos/artefactos locales. El checker de superficie valida estructura/rutas, que solo cambie el prefijo de las rutas publicadas, `$ref` locales resolubles, las cuatro rutas bloqueadas y la exclusion de `/health`. El checker de rewrite inspecciona la policy candidata y comprueba el mapeo de ejemplo; no ejecuta expresiones C# de APIM. La validación anterior encontró 32 paths, 33 operaciones, 303 `$ref` locales resolubles y los cuatro bloqueos; no valida el gateway ni el origen.

Antes de importar o desplegar aún se requiere autorización expresa, revisión de la policy con el responsable de APIM y validación de request/response/query-string en un entorno no productivo aprobado. Este archivo no certifica el encaminamiento ni que las rutas excluidas o bloqueadas formen parte del contrato. No se ejecutaron pruebas de runtime o carga.
