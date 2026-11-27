# Guía · Segunda ronda REAL por el BFF desplegado

La ronda del 23/11 fue **directa a G7**. Esta segunda ronda recorre los mismos casos **a través del BFF desplegado de G1** (`https://g1-marketplace-backend.onrender.com`, sesión por cookie HttpOnly) y alimenta BE #25, #29, #33, #37 y #115, con sus QA #26, #30, #34, #38 y #116. El kit no llama directo a G7: todo pasa por el BFF, que en producción habla con el G7 real (`USE_MOCKS=true` está prohibido en producción).

## Antes de empezar
1. **Autorización de G7 (Brenis)** para esta ronda, con fecha y hora. Sin ella no se ejecuta.
2. La cuenta CLIENTE **sin MFA** (`+g7e`) debe estar ACTIVA en G7 y su contraseña debe ser conocida.
3. Un correo **no registrado** en G7 para la recuperación neutra, un celular ficticio acordado (`+51` y nueve dígitos) y, como opción, un alias nuevo para registro y la cuenta A o B con MFA.
4. En Render, confirmar `G1_WEB_ORIGIN` (el kit envía ese `Origin`) y `CHECKOUT_ADDRESS_SOURCE=g7`. Si no es `g7`, las direcciones responden 503 y la ronda se detiene en el caso 10.
5. Terminal interactiva, sin grabar pantalla.

## Cómo se ejecuta
Desde la raíz del Backend:

```powershell
pwsh -NoProfile -File scripts\bff-integration-real.ps1
```

El script pide, por este orden:
1. Que escribas `AUTORIZADO`.
2. El origen web (con Enter usa `https://g1-marketplace-frontend.vercel.app`).
3. El correo `+g7e` y su contraseña (oculta).
4. El correo no registrado.
5. El celular ficticio.
6. Un alias de registro (opcional) y su contraseña (oculta).
7. Si quieres la rama MFA (S/N), y en ese caso el correo y la contraseña (oculta) de esa cuenta. Durante la ronda pedirá también el **OTP** (oculto).

Al terminar borra las variables de entorno.

Salida: una línea por solicitud con número, hora de Lima, ruta, HTTP, `X-Request-Id` y PASS/FAIL. El informe sanitizado (JSON y Markdown) queda en `docs/evidencias/H5/integracion-real/bff/<fecha>/`, carpeta ignorada por Git. El informe no contiene cuerpos, cookies, contraseñas, correos, OTP ni enlaces; si detecta alguno, no se escribe.

**Salvaguardas:**
- Tope de 30 solicitudes y TLS verificado.
- Solo admite el host aprobado.
- **Ante la primera respuesta inesperada se detiene** (exit 1) y cierra la sesión abierta.
- Un HTTP 429 corta la ronda sin más solicitudes. No se prueba carga ni límites.

## Solicitudes (máximo 24 de 30)

| # | Solicitud | Esperado | Alimenta |
|---|---|---|---|
| 1 | `GET /auth/capabilities` | 200 `login/registro/recuperacion: true` | base |
| 2 | `GET /password/politica` | 200 política válida | base |
| 3 | `POST /auth/login` con un `Origin` ajeno | 403 `FORBIDDEN`, sin contactar a G7 | #29/#30 |
| 4 | `POST /auth/registro` con el correo `+g7e` (ya existe) | 409 `CORREO_NO_DISPONIBLE`, solo `code`/`message` | #25/#26 |
| 5 | `POST /auth/registro` con alias nuevo (opcional) | 201 `PENDIENTE_VERIFICACION`, sin cookie | #25/#26 |
| 6 | `POST /auth/login` con contraseña incorrecta (una vez) | 401 `CREDENCIALES_INVALIDAS`, sin pistas ni cookie | #29/#30 |
| 7 | `POST /auth/login` `+g7e` | 200 `authenticated:true` + cookie de sesión | #29/#30 |
| 8 | `GET /auth/session` | 200 autenticada, mismo usuario | #29/#30 |
| 9 | `GET /checkout/delivery-addresses` | 200 lista propia | #115/#116 |
| 10 | `POST /checkout/delivery-addresses` (sintética) | 201 con `addressId` | #115/#116 |
| 11 | `GET /checkout/delivery-addresses` | 200 incluye la creada | #115/#116 |
| 12 | `POST` con `customerId` de otro usuario en el cuerpo | 400 `ADDRESS_VALIDATION_ERROR` | #115/#116 |
| 13 | `POST /auth/logout` | 200 `remoteRevocationPending:false` y cookie borrada | #33/#34 |
| 14 | `GET /auth/session` con la cookie anterior | 200 `authenticated:false` (anónima) | #33/#34 |
| 15 | `POST /auth/refresh` con la cookie anterior | 401 `UNAUTHORIZED` | #33/#34 |
| 16 | `GET /checkout/delivery-addresses` con la cookie anterior | 401 `UNAUTHORIZED` | #115/#116 |
| 17 | `GET /checkout/delivery-addresses` sin cookie | 401 `UNAUTHENTICATED` | #115/#116 |
| 18 | `POST /auth/logout` repetido | 200 idempotente | #33/#34 |
| 19–22 | MFA opcional: login (desafío por cookie), `otp/solicitar`, `otp/verificar` con el OTP escrito, logout | 200 en cada paso | #29/#30 |
| 23 | `POST /password/recuperar` con la cuenta conocida | 202 sin cuerpo | #37/#38 |
| 24 | `POST /password/recuperar` con el correo no registrado | 202 sin cuerpo (igual que el 23) | #37/#38 |

## Qué no acredita esta ronda
- **Un 202 de recuperación no acredita el envío del correo**: hay que confirmarlo en el buzón. Las dos latencias se registran para #38, pero **dos muestras no concluyen paridad temporal**.
- `GET /auth/session` sin sesión responde **200 anónimo**, no 401. Es el contrato del BFF: el 401 se acredita con `refresh` y con las direcciones (casos 15 a 17).
- El BFF **no recibe un titular** del cliente: el dueño sale de la sesión. El 403 de otro usuario se acreditó en la ronda directa a G7 del 23/11. Aquí se evidencia con el 400 del caso 12 y con los 401.
- No se prueba carga, 429, timeout ni restablecimiento de contraseña.
- El paso 4 y la recuperación pueden hacer que G7 envíe correos a la cuenta `+g7e`.

## Verificación local del kit (MOCK)
- `npm run test:bff:kit`: 11 pruebas con un BFF simulado, sin red.
- El 26/11 el kit también se ensayó contra el BFF Nest real en `localhost`, con PostgreSQL desechable y un doble local de G7: 24/24 PASS. Ese ensayo es **MOCK** y no es evidencia de integración.
