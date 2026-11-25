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

**No ejecutar sin autorización expresa para una ventana de pruebas no productiva.** La instancia confirmada es `apim-g1-marketplace-20` (`rg-marketplace-g1`, West US, Consumption); API ID `marketplace-api`, sufijo `v1`. El header de suscripción activo es `api-key`. Para QA, leer `APIM_QA_SUBSCRIPTION_KEY` desde GitHub Actions Secrets en el entorno aprobado; no copiar el valor al repositorio, consola compartida, logs o evidencias. Las suscripciones individuales confirmadas son `web-frontend-g1`, `ci-qa-smoke` y `demo-team`.

### A. Prueba de Rate Limiting (Issue #309)
Solo durante una ventana autorizada, ejecutar una ráfaga de más de 60 peticiones en menos de un minuto contra una operación contratada. `/v1/health` no pertenece al subconjunto OpenAPI y no debe usarse como ruta de prueba.
```powershell
$KEY = $env:APIM_QA_SUBSCRIPTION_KEY
if (-not $KEY) { throw "APIM_QA_SUBSCRIPTION_KEY no está configurada en el entorno autorizado" }
1..65 | ForEach-Object { curl.exe -s -o NUL -H "api-key: $KEY" -w "Req $_ -> HTTP %{http_code}`n" "https://apim-g1-marketplace-20.azure-api.net/v1/catalog/products?page=0&pageSize=10" }
```
* **Resultado esperado:** APIM devuelve **`429 Too Many Requests`** al superar el límite; las respuestas previas dependen de la disponibilidad del origen.

### B. Prueba de Validación JWT contra G7 (Issue #309)
Hacer una petición a la operación contratada y protegida de favoritos, sin token:
```powershell
curl.exe -i -H "api-key: $KEY" "https://apim-g1-marketplace-20.azure-api.net/v1/wishlist"
```
* **Resultado esperado:** Código **`401 Unauthorized`** con el mensaje:
  `Acceso no autorizado: Token JWT invalido, expirado o ausente`.

### C. Correlación
Enviar `X-Correlation-Id` con un identificador de prueba aprobado. Confirmar en el backend que APIM lo refleja como `X-Request-Id` y que la respuesta pública conserva `X-Correlation-Id`. No reutilizar identificadores reales de usuarios.

> 📷 **Capturas para Issue #309:**
> 1. Terminal mostrando la respuesta `HTTP 401` ante token inválido.
> 2. Terminal mostrando la respuesta `HTTP 429` al superar la cuota.
