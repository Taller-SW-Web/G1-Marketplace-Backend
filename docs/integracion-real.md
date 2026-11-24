# Kit de integración G7 · Hito 5

Cubre #25 (F-001), #29 (F-002), #33 (F-003), #37 (F-004), #41 (F-005) y #115 (F-022). Usa el [OpenAPI G7 1.0.0 fijado](https://github.com/Taller-SW-Web/Modulo-de-Seguridad/blob/1b8f2e35448075a6c396b70fdd4ec1d5b1aa9201/specs/openapi.yaml), la estructura de los casos Prism del [PR #332](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/332) y el contrato de direcciones del [PR #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331). El runner llama a G7 directamente. No acredita por sí solo el BFF desplegado, la UI, el correo ni los gates.

## Antes de REAL

Pedir a G7 la URL HTTPS del sandbox con `/api/v1`, SHA desplegado, revisión de contrato, una ventana de prueba y autorización expresa para generar las solicitudes y los correos, restablecer la cuenta de prueba, usar logout/refresh y probar un plazo corto sobre una lectura. Acordar cómo buscar en su telemetría por `X-Request-Id`. Pedir fixtures sintéticas desechables y una forma segura de compartirlas. La ejecución crea una cuenta y una dirección en sandbox, consume enlaces y cambia la contraseña de una cuenta desechable. G7 debe preparar fixtures nuevas antes de repetirla.

| Variables de entorno | Valor autorizado |
|---|---|
| `G7_INTEGRATION_MODE=real`, `G7_BASE_URL`, `G7_REAL_AUTHORIZED=1` | URL HTTPS `/api/v1` aprobada. La bandera indica que se obtuvo el permiso. |
| `G7_TEST_ENVIRONMENT`, `G7_PROVIDER_SHA` | `sandbox` o `staging` y SHA completo de G7. |
| `G7_TEST_EMAIL`, `G7_TEST_PASSWORD` | Cuenta CLIENTE A de prueba, verificada y sin MFA. |
| `G7_OTHER_USER_ID`, `G7_UNKNOWN_EMAIL` | ID de cuenta CLIENTE B sintética y autorizada para el 403. Correo sintético sin cuenta para recuperación neutra. |
| `G7_REGISTER_EMAIL`, `G7_REGISTER_PASSWORD`, `G7_REGISTER_NAME`, `G7_REGISTER_SURNAME`, `G7_REGISTER_PHONE` | Fixture de alta sin registrar, buzón de prueba y celular sintético autorizado. |
| `G7_VERIFY_TOKEN`, `G7_EXPIRED_VERIFY_TOKEN` | Dos enlaces preprovisionados por G7 para verificar el endpoint. La verificación positiva usa otra cuenta pendiente. El vencido debe ser genuino. |
| `G7_RESET_EMAIL`, `G7_RESET_TOKEN`, `G7_EXPIRED_RESET_TOKEN`, `G7_NEW_PASSWORD` | Cuenta desechable sin MFA, token válido de esa cuenta, token genuinamente vencido de otra fixture y contraseña nueva. Son independientes de la solicitud F-004, que invalida enlaces anteriores de su propia cuenta. |
| `G7_MFA_EMAIL`, `G7_MFA_PASSWORD`, `G7_MFA_OTP` | Opcionales como grupo. Cuenta CLIENTE separada con MFA y código determinista del sandbox para el nuevo desafío. Si G7 solo entrega OTP por correo, registrar ese paso manualmente. |

Cargar los valores en el entorno por el canal privado acordado, sin pegarlos en la consola, el repositorio o GitHub. Ejecutar desde el backend:

```pwsh
npm run integracion:real
```

El kit rechaza configuración incompleta antes de abrir conexiones. El modo REAL exige TLS, autorización y fixtures. Ejecuta casos secuenciales con un límite de 25 solicitudes. No reintenta escrituras tras un fallo de transporte. El retest automático se limita a una lectura sobre `/password/politica`.

## MOCK con Prism

Desde este worktree, iniciar Prism local en una terminal. El contrato de G7 debe estar en el SHA fijado arriba.

```pwsh
npm exec --yes --package=@stoplight/prism-cli@5.16.0 -- prism mock "../../repositories/Modulo-de-Seguridad/specs/openapi.yaml" -h 127.0.0.1 -p 4010 --verboseLevel warn
```

En otra terminal ejecutar:

```pwsh
$env:G7_INTEGRATION_MODE = 'mock'
$env:G7_BASE_URL = 'http://127.0.0.1:4010'
npm run integracion:real
```

MOCK acepta solo HTTP loopback y usa sus propios datos sintéticos. Prism elige las respuestas del contrato mediante `Prefer`. El ejemplo oficial de OTP devuelve rol VENDEDOR. En REAL se exige CLIENTE. Las respuestas de Prism no demuestran estado, persistencia, revocación, envío de correo ni autorización real.

## Interpretar y publicar evidencia

El JSON queda en `docs/evidencias/H5/integracion-real/<fecha UTC>/` con nombre y propiedad `MOCK` o `REAL`. Contiene entorno, SHA local y de G7 (cuando se declara), versión del contrato, método, ruta parametrizada, nombres de campos, resultado, HTTP, latencia y traza generada. `traceEchoed` indica si G7 devolvió el mismo ID. Nunca guarda el valor de campos, la URL configurada, cabeceras del servicio ni cuerpos. La carpeta está ignorada por Git. Abrir el reporte y pegar solo la fila o resumen sanitizado pertinente. Códigos de salida: 0 sin fallos ni omisiones, 1 fallo de caso/configuración y 2 pasos omitidos o inconclusos.

Un timeout detectado aquí es del **cliente**. Si la lectura con plazo corto responde correctamente antes del límite, el resultado es INCONCLUSIVE y el retest con plazo normal se ejecuta igual. El retest demuestra que la lectura con plazo normal respondió. Para acreditar la indisponibilidad del proveedor y el tratamiento en cada ruta BFF, coordinar un sandbox con un escenario de fallo explícito. No deducir revocación global de un 401 al reutilizar el refresh de la sesión cerrada. Un 202 uniforme en dos casos no certifica equivalencia estadística de tiempos. Antes de aprobar un gate, añadir el recorrido G1↔G7 desplegado, evidencia de interfaz/correo cuando aplique y revisión independiente.

## Plantillas para pegar tras ejecutar REAL

Reemplazar los campos entre corchetes. Dejar explícitos los pasos faltantes y no cambiar el gate por el solo resultado del kit.

| Issue | Plantilla |
|---|---|
| [#25](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/25) | **REAL [entorno/fecha]**, G7 [SHA/contrato], kit [SHA]. Registro y confirmación [HTTP/ms/trazas]. Duplicado y vencimiento [resultados]. Retorno al login, correo y timeout en G1 [evidencia o pendiente]. Revisión [estado]. |
| [#29](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/29) | **REAL [entorno/fecha]**, G7 [SHA/contrato], kit [SHA]. Login CLIENTE, rechazo, MFA/OTP [HTTP/ms/trazas u omisión]. Sesión, retorno y timeout en G1 [evidencia o pendiente]. Revisión [estado]. |
| [#33](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/33) | **REAL [entorno/fecha]**, G7 [SHA/contrato], kit [SHA]. Logout y refresh anterior [HTTP/ms/trazas]. Limpieza/UI, idempotencia y timeout en G1 [evidencia o pendiente]. Revisión [estado]. |
| [#37](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/37) | **REAL [entorno/fecha]**, G7 [SHA/contrato], kit [SHA]. Recuperación conocida/desconocida [HTTP/ms/trazas]. Entrega, retorno al login y timeout en G1 [evidencia o pendiente]. Revisión [estado]. |
| [#41](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/41) | **REAL [entorno/fecha]**, G7 [SHA/contrato], kit [SHA]. Reset válido, vencido, usado y nuevo ingreso [HTTP/ms/trazas]. Revocación de otras sesiones, retorno y timeout en G1 [evidencia o pendiente]. Revisión [estado]. |
| [#115](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/115) | **REAL [entorno/fecha]**, G7 [SHA/contrato], kit [SHA]. Alta/listado y 403 entre fixtures [HTTP/ms/trazas]. BFF desplegado [SHA/traza], timeout y G-ADDRESS [evidencia o pendiente]. Revisión [estado]. |
