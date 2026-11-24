# Azure API Management (Plan Consumption) — Guía de Implementación H5

Este directorio contiene las políticas como código y las instrucciones para los siguientes issues de H5:
- **BE #307 (`TASK-H5-APIM-001`):** Crear suscripción e instancia en plan Consumption y dar acceso IAM.
- **BE #309 (`TASK-H5-APIM-003`):** Políticas `validate-jwt` (G7), Rate Limiting (429) y CORS.
- **BE #311 (`TASK-H5-APIM-006`):** Políticas como código y despliegue por pipeline.

---

## 1. Creación de la Instancia en Azure Portal (Paso a Paso)

> [!CAUTION]
> **Plan Obligatorio: Consumption.**  
> NO seleccionar *Developer*, *Basic* ni *Standard*, ya que tienen costo por hora elevado.  
> El plan **Consumption (Serverless)** incluye **1,000,000 de llamadas gratis al mes** y se despliega en solo ~5 minutos.

1. Ingresar a [Azure Portal](https://portal.azure.com).
2. En la barra superior buscar **API Management services** y hacer clic en **Crear**.
3. Rellenar los campos:
   - **Suscripción:** Tu suscripción de Azure for Students o Pay-As-You-Go.
   - **Grupo de recursos:** Crear nuevo llamado `rg-marketplace-g1`.
   - **Nombre del servicio:** `apim-g1-marketplace-20` (desplegado en `West US`, plan `Consumption`).
   - **Región:** `East US` (o la región más cercana con cupo).
   - **Nombre de la organización:** `G1 Marketplace`
   - **Correo electrónico de administrador:** Tu correo.
   - **Plan de tarifa (Pricing tier):** Seleccionar **Consumption**.
4. Clic en **Revisar y crear** $\rightarrow$ **Crear**.

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

> 📷 **Captura 1 para Issue #307:** Pantalla de vista general donde se observe el nombre `apim-g1-marketplace`, el plan `Consumption` y la lista de IAM con el equipo.

---

## 3. Importar el API del Backend (OpenAPI)

1. En el menú lateral de APIM, ir a **APIs**.
2. Clic en **Add API** $\rightarrow$ seleccionar mosaico **OpenAPI**.
3. Seleccionar **Full** y configurar:
   - **OpenAPI specification:** Ingresar una de las URLs reales de Swagger de Render (ej. `https://g1-marketplace-backend.onrender.com/docs/specs/openapi-catalogo-h4.json` o `/docs/specs/openapi-h3.json`) o crear una API HTTP apuntando a `https://g1-marketplace-backend.onrender.com`.
   - **Display name:** `G1 Marketplace Backend API`
   - **Name:** `marketplace-api`
   - **API URL suffix:** `v1`
   - **Web service URL:** `https://g1-marketplace-backend.onrender.com`
4. Clic en **Create**.

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
