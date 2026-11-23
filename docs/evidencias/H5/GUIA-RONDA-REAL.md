# Guía de la ronda funcional REAL con Seguridad · 23/11/2026

**Preparación local. La ronda aún no se ha ejecutado.** Brenis autorizó una sola ronda de F-001 a F-005 y F-022 para cuentas desechables de Jim. Jim debe avisar antes de lanzar y acordar la hora en Lima. La autorización no se extiende a carga, timeout inducido, RabbitMQ ni ejecuciones adicionales. El kit llama a G7 directamente. Las verificaciones BFF/UI y la revisión de G-AUTH/G-ADDRESS requieren evidencia propia.

## Preparación y variables REAL

Preparar tres buzones controlados por Jim. **A** es un CLIENTE verificado sin MFA y se usará también para recuperar y cambiar su contraseña. **B** es otro CLIENTE con MFA por correo activado desde «Mi cuenta». Preparar y verificar B antes de lanzar, anotando si la activación consumió algún envío de código durante los últimos 15 minutos. **C** es un buzón nuevo para el alta. Usar datos de perfil y de dirección ficticios. Confirmar con Jim que A puede quedar con la contraseña nueva y que el alta C es desechable.

| Variable | Valor y procedencia |
|---|---|
| `G7_INTEGRATION_MODE` | `real`. Seleccionar solo en el terminal de la ronda futura. |
| `G7_BASE_URL` | `https://g7-auth-service.onrender.com/api/v1`, URL autorizada por Brenis. |
| `G7_REAL_AUTHORIZED` | `1` solamente después de que Jim avise a Brenis y confirme la ventana. |
| `G7_MANUAL_MAIL` | `1` para introducir en el momento los códigos que llegan por correo. Requiere TTY sin grabación y TLS activo. |
| `G7_TEST_ENVIRONMENT` | `authorized-test`: cuentas sintéticas en el servicio autorizado, sin afirmar que sea un sandbox separado. |
| `G7_TEST_EMAIL`, `G7_TEST_PASSWORD` | Buzón y contraseña inicial de A. |
| `G7_MFA_EMAIL`, `G7_MFA_PASSWORD` | Buzón y contraseña de B. |
| `G7_REGISTER_EMAIL`, `G7_REGISTER_PASSWORD` | Buzón nuevo C y contraseña elegida por Jim conforme a la política de G7. |
| `G7_REGISTER_NAME`, `G7_REGISTER_SURNAME`, `G7_REGISTER_PHONE` | Nombre, apellido y celular ficticios compatibles con el contrato. El celular usa formato `+51` y nueve dígitos. |
| `G7_NEW_PASSWORD` | Contraseña de reemplazo acordada para A, distinta de la inicial y conforme a la política. |
| `G7_PROVIDER_SHA` | Opcional en este modo. Pedir a Brenis el SHA completo del despliegue efectivo. Si falta, dejarlo sin definir: el reporte dirá `null` y no acredita la revisión de G7. |
| `G7_EXPIRED_VERIFY_TOKEN`, `G7_EXPIRED_RESET_TOKEN` | Opcionales. La autorización no los proporciona. Pedir a Brenis fixtures genuinamente vencidas para cuentas de prueba. Si faltan, dejar ambas variables sin definir y registrar `SKIP`. |
| `G7_OTHER_USER_ID` | Opcional. Pedir a G7 el UUID de B y confirmar que habilita el negativo A→B. Si no llega, dejarlo sin definir. Alta/listado de A se ejecutan y el 403 queda `SKIP`. |
| `G7_UNKNOWN_EMAIL` | Opcional. Solo un buzón sintético que G7 confirme que no está registrado y que se puede usar para el 202 neutro. Si falta, ese negativo queda `SKIP`. C no sirve para esto después de registrarlo. |

En este modo **no se configuran** `G7_VERIFY_TOKEN`, `G7_MFA_OTP` ni `G7_RESET_TOKEN`. Son valores de un solo uso que Brenis no puede entregar de antemano para los desafíos de esta corrida. Introducir **solo el valor** que llega a C o A, o los seis dígitos para B, cuando lo pida el terminal. No abrir el enlace de confirmación antes de que el kit pruebe el token. Abrir el correo para identificar el enlace y extraer su valor localmente, sin enviar el enlace a herramientas externas. Si no llega a tiempo, Enter sin escribir omite ese paso. `G7_RESET_EMAIL` tampoco se configura: el reset usa A después de su logout. El [modo preprovisionado](../../integracion-real.md) sigue disponible para un sandbox con fixtures específicas. No corresponde a este permiso.

Cargar los valores de prueba por un canal privado en las variables del proceso, sin escribir contraseñas ni tokens literalmente en comandos, archivos, transcripciones o historial. Ejecutar `npm run integracion:real` **una vez**, manualmente, después del aviso. No preparar ni lanzar esto en un terminal grabado o compartido.

## Orden, presupuesto y pasos manuales

| Paso | Operaciones del kit y de Jim | Tope planificado |
|---|---|---|
| 1 · F-001 | Alta de C, un intento de alta repetida como contraste, una confirmación con el token del correo C. Vencido solo si G7 entrega fixture. | 3 HTTP base, +1 opcional. 0 reenvíos. El alta aceptada puede generar el primer correo. |
| 2 · F-002 | A: login normal y una credencial sintética incorrecta. B: login, solicitar OTP una vez, introducir el código recién recibido, verificar y cerrar la sesión B. Si no llega el OTP, omitir y no solicitar otro. | 6 HTTP base. 1 solicitud de código para B, 0 para A. |
| 3 · F-022 | Alta y listado de dirección ficticia propia de A, comparando el ID creado. Solo con B autorizado y UUID disponible, comprobar 403 en su lista con el token de A. | 2 HTTP base, +1 opcional. |
| 4 · F-003 | Logout de A y un intento funcional de usar el refresh de esa sesión cerrada, solo tras 204. | 2 HTTP base. |
| 5 · F-004 | Una solicitud de recuperación para A. Opcionalmente, una para el buzón desconocido acordado. Jim abre el correo de A. | 1 por buzón, 1 HTTP base y +1 opcional. |
| 6 · F-005 | Introducir el token de recuperación de A. Restablecer, comprobar un uso repetido del mismo enlace, iniciar con la clave nueva y cerrar. Vencido solo con fixture genuina. | 4 HTTP base y +1 opcional. No solicita otro correo. |

Son **18 HTTP base**, hasta **22** con los cuatro casos opcionales, por debajo del tope de **25** del kit. Consultar antes si ya hubo envíos en la ventana. Verificación: máximo 3 reenvíos/hora por correo; este kit hace 0. Recuperación: máximo 3 solicitudes/hora por correo; este kit hace 1 por buzón configurado. MFA: máximo 3 solicitudes de código/usuario por 15 min; este kit hace 1 para B. No compensar omisiones con reenvíos o relanzamientos manuales.

Un **429** corta la corrida y guarda la evidencia reunida y el `Retry-After` saneado (segundos o fecha UTC). No hacer más solicitudes en esa ronda. Respetar el plazo indicado y coordinar con Brenis antes de cualquier nueva ejecución; si no hay cabecera, pedirle indicaciones. Si hay fallo de red o estado incierto, no repetir la mutación ni relanzar todo. La ronda manual conserva un plazo HTTP normal, pero omite el timeout inducido.

## Cobertura esperada y pendientes

| Issue | Qué puede aportar REAL si pasa | Qué queda parcial, MOCK o SKIP |
|---|---|---|
| #25 F-001 | Registro de C, repetido 409 y confirmación del correo si llega. | Sin entrega del correo no hay confirmación; vencimiento `SKIP` sin fixture. Reenvío, enlace ya usado, retorno UI, timeout y revisión siguen fuera de esta ronda. |
| #29 F-002 | Login A, rechazo funcional y desafío/OTP B si llega el código, con cierre de esa sesión. | OTP omitido, expiración, límites efectivos, cookie/retorno BFF y timeout no se acreditan aquí. |
| #33 F-003 | Logout A y rechazo del refresh de esa sesión. | Limpieza y reintento en G1, revocación entre dispositivos y timeout no se infieren. |
| #37 F-004 | 202 para A y recepción manual si llega el correo; 202 neutro si se acordó buzón adicional. | Sin buzón desconocido, negativo `SKIP`. Sin estimación estadística de latencia ni prueba de timeout. |
| #41 F-005 | Reset de A con correo recibido, token consumido rechazado y nuevo login, si cada paso pasa. | Vencido `SKIP` sin fixture genuina. Revocación global, retorno UI y timeout quedan pendientes. |
| #115 F-022 | Alta y listado G7 del mismo domicilio ficticio. 403 solo con UUID B de prueba autorizado. | Sin B, negativo `SKIP`. Falta BFF/FE desplegado y G-ADDRESS. Cotización sigue MOCK. |

Usar la etiqueta REAL solo para las filas ejecutadas contra G7. Los casos omitidos siguen sin evidencia REAL aunque tengan evidencia **MOCK** previa. Ni una corrida directa exitosa ni un SHA local cierran por sí solos las issues o gates.

## Evidencia y limpieza

El kit guarda un JSON por ejecución en `docs/evidencias/H5/integracion-real/<fecha UTC>/`, carpeta ignorada por Git. Incluye modo, SHAs disponibles, contrato, hora UTC por solicitud, ruta parametrizada, HTTP, latencia, traza y código de error si está en la lista pública del runner. No guarda valores del request, cuerpos, tokens ni datos personales. Para un fallo revisado manualmente, comunicar solo el código público de error, nunca el cuerpo o su texto. El código de salida 1 indica fallo o corte por 429; 2 indica omisiones o resultados inconclusos sin fallos. Las omisiones deliberadas de esta ronda pueden dar salida 2.

Revisar y pegar solo el resumen sanitizado, con casos omitidos y pendientes, en las [plantillas por issue](../../integracion-real.md#plantillas-para-pegar-tras-ejecutar-real). Enviar a Brenis hora, ruta, HTTP y código de error de los fallos, sin secretos. Para la limpieza local, cerrar el terminal o borrar las variables privadas del proceso, vaciar el portapapeles si se usó, cerrar los buzones de prueba y conservar solo la evidencia sanitizada. Confirmar con Jim/G7 qué hacer con la cuenta y la dirección de prueba posteriores a la corrida.

## Borrador para Brenis · pendiente de envío por Jim

Hola, Brenis. Te aviso antes de lanzar la única ronda funcional de F-001 a F-005 y F-022. Estimamos iniciarla el 23/11 a las [HH:mm, Lima], previa coordinación contigo. Usaremos únicamente cuentas de prueba que controlamos y una dirección ficticia. No incluiremos RabbitMQ, carga ni timeout inducido. Si recibimos un 429, detendremos la ronda y respetaremos Retry-After.

¿Nos confirmas el SHA completo del despliegue de G7 y si pueden darnos enlaces de prueba genuinamente vencidos para verificación y recuperación? Si no están disponibles, ¿está bien dejar esos casos sin evidencia REAL? Si podemos probar el 403 entre nuestras cuentas de prueba, confírmanos también el UUID de la segunda por el canal acordado. Al terminar te enviamos hora, ruta, HTTP y código de error de lo que falle, sin tokens ni secretos.
