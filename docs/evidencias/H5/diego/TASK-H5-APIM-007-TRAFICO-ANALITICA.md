# TASK-H5-APIM-007 (`BE #312`): Pruebas de tráfico APIM y analítica

- **Issue:** [BE #312](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/312)
- **Responsable:** `@DiesmEsp` · **Revisor:** `@saire22`
- **Gateway APIM:** `https://apim-g1-marketplace-20.azure-api.net/v1` (plan `Consumption`)
- **Política de referencia con caché:** [azure-apim/policies/api-policy.xml en el SHA `b45c608`](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/b45c608918a1fef33db943715f1fa7ecbfc63f8f/azure-apim/policies/api-policy.xml). El workflow de ese SHA validó el XML y omitió los pasos de autenticación y despliegue en Azure. [Ejecución de CI](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45895396227)

## 1. Script reproducible de verificación (`scripts/verify-apim-policies.mjs`)

El script lee `APIM_SUBSCRIPTION_KEY` del entorno y la envía como `api-key`, tal como anuncia el gateway. Comprueba primero `200` en `/health`. Después verifica el `401` de JWT y el eco de `X-Correlation-Id` en `/cart`, y busca `X-Cache: HIT` en solicitudes repetidas a `/docs/specs`. Con `APIM_RUN_RATE_LIMIT=true`, comprueba `429` con `Retry-After` y detiene la secuencia en la primera respuesta distinta de `200`. Cualquier comprobación habilitada que falle produce código de salida `1`. La salida incluye estados y cabeceras de evidencia sin imprimir claves ni cuerpos de respuesta.

Ejecutar con una suscripción de QA provisionada por el equipo.
```powershell
$env:APIM_SUBSCRIPTION_KEY = "<PRIMARY_KEY_DESDE_AZURE_PORTAL>"
$env:APIM_RUN_RATE_LIMIT = "true"
node scripts/verify-apim-policies.mjs
```

`APIM_CACHE_PATH=/health` permite comprobar la otra ruta cacheable. La ruta predeterminada es `/docs/specs`.

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
3. **Corrida real con suscripción QA.** Ventana principal `2026-11-26 22:41:36–22:41:44 UTC` (17:41, hora de Lima). [Logs sanitizados de GitHub Actions](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45906386893)

   | Comprobación | Resultado observado |
   |---|---|
   | Suscripción válida | `GET /health` → `200` con `api-key`. |
   | JWT ausente | `GET /cart` → `401` con el mensaje de validación JWT de la política, usando la misma suscripción válida. |
   | Traza del rechazo JWT | `X-Correlation-Id` enviado y devuelto, y `X-Request-Id` devuelto: `apim-312-9e6b0c87-037e-408c-a725-521d31804260`. |
   | Rate limit | Tras 51 respuestas `200` en la secuencia, `GET /health` → `429` con `Retry-After: 54` y traza `apim-312-6899eb40-341b-4986-b753-d51b2379011b`. |
   | Caché en `/docs/specs` | Cuatro respuestas `200` con `X-Cache: MISS`. El script terminó con código `1` por falta de `HIT`. |

   La corrida alternativa a las `22:43 UTC` también devolvió cuatro `200` con `X-Cache: MISS` en `/health`, con rate limit deshabilitado para esa corrida. El script volvió a terminar con código `1`. Queda cotejar en Azure la revisión activa y el funcionamiento de su caché externa antes de registrar un `HIT`. [Corrida alternativa](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45906595891)

4. **Analytics pendiente.** Adjuntar una captura real del panel **Azure Portal → `apim-g1-marketplace-20` → Analytics**, filtrada a la ventana de tráfico de la verificación. El acceso automatizado al navegador no estuvo disponible.

## 3. Verificación automatizada
- `npm run lint` (`tsc --noEmit`): **PASS** (`0` errores)
- `npx jest test/apim-policy.spec.ts`: **PASS** (`1/1` suite, `3/3` tests)
- `node --check scripts/verify-apim-policies.mjs`: **PASS**.
- Prueba local con servidor HTTP de prueba: **PASS** para los diez escenarios de salida. La respuesta de suscripción inválida, el `401` distinto al de JWT, la traza incorrecta, la ausencia de `X-Cache: HIT`, la ausencia de `429`, la ausencia de `Retry-After`, un código inesperado y la falta de clave produjeron salida `1`. La ejecución correcta y la ejecución con rate limit deshabilitado produjeron salida `0`.
