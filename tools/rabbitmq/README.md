# RabbitMQ de pruebas · BE #313

Node 22+ sin dependencias nuevas. Los scripts usan la API HTTP de management de un **broker de pruebas**, con la cuenta administradora de Jim. G7 y G1 usan sus cuentas separadas por AMQP sobre TLS, sin roles de management.

CloudAMQP Little Lemur [no permite administrar usuarios ni permisos](https://www.cloudamqp.com/docs/faq/). Para ejecutar el setup completo se necesita un broker administrable. Si recibe 401/403, detenerse y revisar la cuenta y el plan antes de seguir. No relajar el aislamiento de las cuentas.

Cargar en el entorno del proceso `RABBITMQ_MANAGEMENT_URL` (HTTPS, raíz o `/api`, sin credenciales en la URL), `RABBITMQ_VHOST` (ya provisionado), `RABBITMQ_ADMIN_USER` y `RABBITMQ_ADMIN_PASSWORD`. Para el setup también se requieren `RABBITMQ_G7_PUBLISHER_PASSWORD` y `RABBITMQ_G1_CONSUMER_PASSWORD`. Usar tres secretos distintos. HTTP solo se admite en loopback. El cliente rechaza redirecciones y no imprime cuerpos de error.

Ejecutar desde la raíz del backend, en este orden:

```powershell
node tools/rabbitmq/setup-broker.mjs
node tools/rabbitmq/publicar-evento-prueba.mjs usuario.creado
node tools/rabbitmq/leer-cola.mjs 5
```

- **Setup:** crea las cuentas sin tags, aplica permisos exactos, declara recursos durables y configura el descarte por política. Repetir con los mismos valores deja la misma topología y permisos. Cambiar contraseñas en el entorno las actualiza. Una definición preexistente incompatible debe revisarse antes de volver a ejecutar.
- **Publicar:** el tipo por omisión es `usuario.creado`; también admite `usuario.bloqueado` y `usuario.roles_cambiados`. Genera UUID sintéticos y exige `routed:true`. Su salida siempre marca **MOCK**. La publicación HTTP usa POST, como el [handler de RabbitMQ](https://github.com/rabbitmq/rabbitmq-server/blob/main/deps/rabbitmq_management/src/rabbit_mgmt_wm_exchange_publish.erl).
- **Leer:** consulta ambas colas, hasta 5 mensajes por defecto, máximo 10 por cola. `ack_requeue_true` toma mensajes y los vuelve a encolar. Puede alterar orden visible o marcar reentrega. Usarlo con el consumidor detenido, solo en pruebas. Imprime tipo, versión e ID del evento reconocido. No imprime payload, `datos` ni `usuarioId`.

Pruebas **MOCK**, con un doble de transporte local en memoria:

```powershell
node --test tools/rabbitmq/broker.test.mjs
```
