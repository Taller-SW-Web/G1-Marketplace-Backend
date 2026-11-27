# Azure API Management (Plan Consumption) — Guía de Implementación H5

Este directorio contiene las políticas como código y las instrucciones para los siguientes issues de H5:
- **BE #307 (`TASK-H5-APIM-001`):** Crear suscripción e instancia en plan Consumption y dar acceso IAM.
- **BE #309 (`TASK-H5-APIM-003`):** Políticas `validate-jwt` (G7), Rate Limiting (429) y CORS.
- **BE #311 (`TASK-H5-APIM-006`):** Políticas como código y despliegue por pipeline.
- **BE #394:** [Matriz de aceptación por política y ventana QA](../docs/evidencias/H5/apim/README.md). La nueva corrida sigue **NOT_RUN**.

---

## 1. Instancia APIM existente

El responsable de APIM confirmó por escrito que la instancia ya existe y está en línea. **No crear una instancia duplicada.** Los siguientes datos son la configuración confirmada, no el resultado de una consulta hecha por este runbook:

1. Ingresar a [Azure Portal](https://portal.azure.com).
2. Abrir **API Management services** y localizar `apim-g1-marketplace-20` en `rg-marketplace-g1`.
3. Confirmar visualmente región `West US` y plan `Consumption` antes de cualquier acción de configuración.

---

## 2. Dar Acceso al Equipo (IAM)

1. En el recurso APIM creado, ir al menú lateral $\rightarrow$ **Access control (IAM)**.
2. Clic en **Add** $\rightarrow$ **Add role assignment**.
3. Seleccionar el rol: **API Management Service Contributor**.
4. En miembros, buscar y agregar a los compañeros del equipo:
   - Leonidas García
   - Diego Espinosa
   - Fernando Saire
   - Jim Segovia
5. Clic en **Review + assign**.

> 📷 **Captura 1 para Issue #307:** Pantalla de vista general donde se observe el nombre `apim-g1-marketplace-20`, el plan `Consumption` y la lista de IAM con el equipo.

---

## 3. Importar el API del Backend (OpenAPI)

Para #308, usar como referencia solamente el [subset contratado de PR #348](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/348). Las instrucciones genéricas que siguen no autorizan importar otra superficie del BFF. `/v1/health`, `/v1/docs` y `/v1/docs/specs` están excluidas del subset; no publicarlas ni probarlas para #394.

1. En el menú lateral de APIM, ir a **APIs**.
2. Clic en **Add API** $\rightarrow$ seleccionar mosaico **OpenAPI** e importar el archivo local `docs/apim/marketplace-bff-v1.subset.openapi.yaml`.
3. Configurar el API confirmado:
   - **Display name:** `G1 Marketplace Backend API`
   - **Name / API ID:** `marketplace-api`
   - **API URL suffix:** `v1`
   - **Web service URL (`serviceUrl`):** `https://g1-marketplace-backend.onrender.com` (origen, sin prefijo de ruta)
   - **Gateway público:** `https://apim-g1-marketplace-20.azure-api.net/v1`
4. La importación de este OpenAPI exacto de 41 operaciones no está acreditada por este runbook. El responsable informó que el routing/rewrite de `marketplace-api` se actualizó en el commit `df137b1` de la PR #359; esto no confirma que se importara este subset.

El OpenAPI candidato contiene solo 41 operaciones contratadas; la importación de ese archivo no queda acreditada por este runbook. No incluye `/health`, `/docs` ni `/docs/specs/*`; no agregar `/v1/health` ni `/v1/docs` por medio del rewrite genérico. El candidato offline `docs/apim/v1-backend-rewrite.policy.xml` mapea únicamente las operaciones contratadas `/v1/...` a `/api/v1/...` y conserva query params.

---

## 4. Aplicar la Política (`policies/api-policy.xml`)

**No aplicar ni reemplazar la policy desde esta rama.** El archivo `azure-apim/policies/api-policy.xml` de esta PR no contiene la revisión `df137b1` reportada por el responsable APIM en la PR #359. Primero deben reconciliarse las ramas y confirmarse una sola policy canónica; cualquier cambio en Azure requiere autorización expresa. El rewrite candidato de `docs/apim/v1-backend-rewrite.policy.xml` es un artefacto distinto; no sustituir con él la policy canónica.

1. En la lista de APIs, seleccionar **`G1 Marketplace Backend API`** (nivel de API $\rightarrow$ **All operations**; no usar *All APIs* porque `<rate-limit>` en plan Consumption solo aplica a nivel de API/Producto/Operación).
2. En la sección **Inbound processing**, hacer clic en el ícono de código `</>` (Code editor).
3. Aplicar la versión acordada solo después de reconciliar las ramas y recibir autorización expresa; no sobrescribir la policy actual usando el XML de esta rama, que aún no incluye `df137b1`.

---

## 5. Pruebas de Validación y Evidencias

La [matriz de #394](../docs/evidencias/H5/apim/README.md) distingue el smoke **REAL histórico** de los casos pendientes: JWT (`401`), rate limit (`429` con `Retry-After`), caché (`MISS/HIT`) y correlación APIM → BFF. Antes de emitir tráfico, confirmar ventana autorizada, suscripción QA por canal privado, revisión activa y acceso a los logs del BFF. Limitarse a las operaciones contratadas y aprobadas; no ejecutar una ráfaga contra `/v1/health`. Sin ruta cacheable aprobada dentro del subset, `MISS/HIT` queda **NOT_RUN**. La policy en Git no acredita su revisión activa; el export de solo lectura sigue pendiente. No guardar detalles de suscripciones ni credenciales en la evidencia.

El header de suscripción confirmado es `api-key`. Para cualquier smoke QA autorizado usar únicamente `APIM_QA_SUBSCRIPTION_KEY` desde GitHub Actions Secrets; no copiar ni imprimir su valor. No utilizar `Ocp-Apim-Subscription-Key`, la suscripción all-access ni `/v1/health` como endpoint de prueba.

### A. Rate limiting (Issue #309)
La prueba de más de 60 llamadas requiere autorización expresa y una ventana QA aprobada. Está pendiente; este runbook no contiene ni ejecuta una ráfaga. Debe apuntar a una operación contratada; el status previo al límite depende de la disponibilidad del BFF.

### B. Validación JWT contra G7
Usar únicamente una operación contratada y el caso QA previamente aprobado. Sin JWT se espera `401 Unauthorized`; no usar `/v1/cart` ni rutas fuera del subset.

### C. Rewrite y correlación
El smoke manual [45536575477](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45536575477) obtuvo `503` en catálogo (esperado `200`) y `401` en wishlist (esperado `401`); ambos headers de correlación coincidieron. El responsable atribuyó el `503` a G6 (`CATALOG_UNAVAILABLE`), sin que el body se registrara en el smoke. Es evidencia de solo dos GET; no certifica las 41 operaciones. No repetir hasta que el responsable de G6 confirme disponibilidad.

**Límite de la evidencia:** esta sección registra resultados previos; no autoriza ni ejecuta pruebas, ráfagas, smoke ni cambios en APIM. Cualquier revalidación requiere una ventana QA autorizada.

> 📷 **Capturas para Issue #309:**
> 1. Terminal mostrando la respuesta `HTTP 401` ante token inválido.
> 2. Terminal mostrando la respuesta `HTTP 429` al superar la cuota.
