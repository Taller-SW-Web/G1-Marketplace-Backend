# Azure API Management (Plan Consumption) — Guía de Implementación H5

Este directorio contiene las políticas como código y las instrucciones para los siguientes issues de H5:
- **BE #307 (`TASK-H5-APIM-001`):** Crear suscripción e instancia en plan Consumption y dar acceso IAM.
- **BE #309 (`TASK-H5-APIM-003`):** Políticas `validate-jwt` (G7), Rate Limiting (429) y CORS.
- **BE #311 (`TASK-H5-APIM-006`):** Políticas como código y despliegue por pipeline.

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

1. En el menú lateral de APIM, ir a **APIs**.
2. Clic en **Add API** $\rightarrow$ seleccionar mosaico **OpenAPI** e importar el archivo local `docs/apim/marketplace-bff-v1.subset.openapi.yaml`.
3. Configurar el API confirmado:
   - **Display name:** `G1 Marketplace Backend API`
   - **Name / API ID:** `marketplace-api`
   - **API URL suffix:** `v1`
   - **Web service URL (`serviceUrl`):** `https://g1-marketplace-backend.onrender.com` (origen, sin prefijo de ruta)
   - **Gateway público:** `https://apim-g1-marketplace-20.azure-api.net/v1`
4. La importación/revisión y configuración son pasos pendientes de autorización; este runbook no acredita que se ejecutaron.

El OpenAPI importado contiene solo 33 operaciones contratadas. No incluye `/health`, `/docs` ni `/docs/specs/*`; no agregar `/v1/health` ni `/v1/docs` por medio del rewrite genérico. El candidato offline `docs/apim/v1-backend-rewrite.policy.xml` mapea únicamente las operaciones importadas `/v1/...` a `/api/v1/...` y conserva query params.

---

## 4. Aplicar la Política (`policies/api-policy.xml`)

1. En la lista de APIs, seleccionar **`G1 Marketplace Backend API`** (nivel de API $\rightarrow$ **All operations**; no usar *All APIs* porque `<rate-limit>` en plan Consumption solo aplica a nivel de API/Producto/Operación).
2. En la sección **Inbound processing**, hacer clic en el ícono de código `</>` (Code editor).
3. Reemplazar el contenido con el XML ubicado en [`azure-apim/policies/api-policy.xml`](./policies/api-policy.xml).
4. Guardar los cambios (**Save**).

---

## 5. Pruebas de Validación y Evidencias

*(En plan Consumption, `<rate-limit>` cuenta por clave de suscripción: obtener la `Primary key` en el menú izquierdo **Subscriptions** $\rightarrow$ `Built-in all-access subscription`).*

### A. Prueba de Rate Limiting (Issue #309)
Ejecutar una ráfaga de más de 60 peticiones en menos de un minuto:
```powershell
$KEY = "<TU_PRIMARY_KEY>"
1..65 | ForEach-Object { curl.exe -s -o NUL -H "Ocp-Apim-Subscription-Key: $KEY" -w "Req $_ -> HTTP %{http_code}`n" "https://apim-g1-marketplace-20.azure-api.net/v1/health" }
```
* **Resultado esperado:** Las primeras 60 responden `200`, a partir de la 61 responde **`429 Too Many Requests`**.

### B. Prueba de Validación JWT contra G7 (Issue #309)
Hacer una petición a un endpoint protegido sin token o con token alterado:
```powershell
curl.exe -i -H "Ocp-Apim-Subscription-Key: $KEY" "https://apim-g1-marketplace-20.azure-api.net/v1/cart"
```
* **Resultado esperado:** Código **`401 Unauthorized`** con el mensaje:
  `Acceso no autorizado: Token JWT invalido, expirado o ausente`.

> 📷 **Capturas para Issue #309:**
> 1. Terminal mostrando la respuesta `HTTP 401` ante token inválido.
> 2. Terminal mostrando la respuesta `HTTP 429` al superar la cuota.
