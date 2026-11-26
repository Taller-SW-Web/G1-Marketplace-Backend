# TASK-H5-APIM-007 (`BE #312`): Pruebas de tráfico APIM y analítica

- **Issue:** [BE #312](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/312)
- **Responsable:** `@DiesmEsp` · **Revisor:** `@saire22`
- **Gateway APIM:** `https://apim-g1-marketplace-20.azure-api.net/v1` (plan `Consumption`)
- **Política evaluada:** [azure-apim/policies/api-policy.xml](../../../azure-apim/policies/api-policy.xml)

## 1. Script reproducible de verificación (`scripts/verify-apim-policies.mjs`)

Sin claves embebidas; lee `APIM_SUBSCRIPTION_KEY` desde entorno:
```powershell
$env:APIM_SUBSCRIPTION_KEY = "<PRIMARY_KEY_DESDE_AZURE_PORTAL>"
$env:APIM_RUN_RATE_LIMIT = "true"
node scripts/verify-apim-policies.mjs
```

## 2. Evidencia ejecutada (2026-11-26)

1. **Prueba en vivo sin Subscription Key (`401` + `X-Correlation-Id`):**
   - Request: `GET https://apim-g1-marketplace-20.azure-api.net/v1/health` (`X-Correlation-Id: test-apim-312-probe`)
   - Response observada:
     ```http
     HTTP/1.1 401 Access Denied
     WWW-Authenticate: AzureApiManagementKey realm="https://apim-g1-marketplace-20.azure-api.net/v1",name="api-key",type="header"
     X-Correlation-Id: 1bc3227e-1413-4118-b4ac-aefb25e0cc47
     X-Request-ID: 2270ddfc-3ce4-48dd-871b-051000f35d6e
     { "statusCode": 401, "message": "Access denied due to missing subscription key. Make sure to include subscription key when making requests to an API." }
     ```
2. **Validación automatizada de políticas XML (`test/apim-policy.spec.ts`):**
   - `X-Correlation-Id` en `inbound`, `outbound` y `on-error`
   - `<rate-limit calls="60" renewal-period="60" retry-after-header-name="Retry-After" />` (`429`)
   - `<validate-jwt failed-validation-httpcode="401">` contra JWKS de G7 con exclusión de rutas públicas (`/health`, `/docs`, `/catalog`, `OPTIONS`)
3. **Pendiente de captura manual en Azure Portal (requiere sesión Azure + `Primary key`):**
   - Ejecutar `scripts/verify-apim-policies.mjs` con `APIM_SUBSCRIPTION_KEY` y `APIM_RUN_RATE_LIMIT=true` para registrar `401` JWT, `429` + `Retry-After` y `Cache HIT`.
   - Adjuntar captura del panel **Azure Portal → `apim-g1-marketplace-20` → Analytics** mostrando las métricas de tráfico `200 / 401 / 429`.

## 3. Verificación automatizada
- `npm run lint` (`tsc --noEmit`): **PASS** (`0` errores)
- `npx jest test/apim-policy.spec.ts`: **PASS** (`1/1` suite, `3/3` tests)
- `node scripts/verify-apim-policies.mjs` (sin key): **PASS** (`401` + `X-Correlation-Id` verificados contra gateway real)
