# Azure API Management (Plan Consumption) — Guía de Implementación H5

Este directorio contiene las políticas como código y las instrucciones para los siguientes issues de H5:
- **BE #307 (`TASK-H5-APIM-001`):** Crear suscripción e instancia en plan Consumption y dar acceso IAM.
- **BE #309 (`TASK-H5-APIM-003`):** Políticas `validate-jwt` (G7), Rate Limiting (429) y CORS.
- **BE #311 (`TASK-H5-APIM-006`):** Políticas como código y despliegue por pipeline.
- **BE #394:** [Matriz de aceptación por política y ventana QA](../docs/evidencias/H5/apim/README.md). La nueva corrida sigue **NOT_RUN**.

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

Para #308, usar como referencia solamente el [subset contratado de PR #348](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/348). Las instrucciones genéricas que siguen no autorizan importar otra superficie del BFF. `/v1/health`, `/v1/docs` y `/v1/docs/specs` están excluidas del subset; no publicarlas ni probarlas para #394.

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

La [matriz de #394](../docs/evidencias/H5/apim/README.md) distingue el smoke **REAL histórico** de los casos pendientes: JWT (`401`), rate limit (`429` con `Retry-After`), caché (`MISS/HIT`) y correlación APIM → BFF. Antes de emitir tráfico, confirmar ventana autorizada, suscripción QA por canal privado, revisión activa y acceso a los logs del BFF. Limitarse a las operaciones contratadas y aprobadas; no ejecutar una ráfaga contra `/v1/health`. Sin ruta cacheable aprobada dentro del subset, `MISS/HIT` queda **NOT_RUN**. La policy en Git no acredita su revisión activa; el export de solo lectura sigue pendiente. No guardar detalles de suscripciones ni credenciales en la evidencia.
