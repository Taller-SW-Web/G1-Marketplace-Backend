# RabbitMQ de pruebas · BE #313

Node 22+ sin dependencias nuevas. Usar un broker de pruebas y el vhost ya provisionado. Los scripts llaman a la API HTTP de management. G7 y G1 se conectan por AMQP sobre TLS.

## Variables comunes

| Variable | Qué cargar en el entorno del proceso |
|---|---|
| `RABBITMQ_MANAGEMENT_URL` | URL HTTPS de RabbitMQ Manager para el host, raíz o `/api`, sin usuario ni contraseña. HTTP se admite solo en loopback. |
| `RABBITMQ_VHOST` | Nombre exacto del vhost existente. Escribirlo tal cual, sin codificarlo. El cliente codifica cada segmento. |
| `RABBITMQ_ADMIN_USER` y `RABBITMQ_ADMIN_PASSWORD` | Credenciales que permiten usar management en el vhost. En modo compartido son las de la cuenta existente del plan. |
| `RABBITMQ_MODO` | `dos-usuarios` por defecto, o `un-usuario` de forma explícita. |

Cargar los secretos por el canal privado acordado. El cliente rechaza redirecciones y no imprime cuerpos de error.

## Dos usuarios

Solo si RabbitMQ Manager permite crear usuarios y asignar permisos. Cargar además `RABBITMQ_G7_PUBLISHER_PASSWORD` y `RABBITMQ_G1_CONSUMER_PASSWORD`, distintos entre sí y de la contraseña de management. Desde la raíz del backend:

```powershell
$env:RABBITMQ_MODO = 'dos-usuarios'
node tools/rabbitmq/setup-broker.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló el setup' }
node tools/rabbitmq/publicar-evento-prueba.mjs usuario.creado
if ($LASTEXITCODE -ne 0) { throw 'Falló la publicación de prueba' }
node tools/rabbitmq/leer-cola.mjs 5
```

El setup crea las dos cuentas sin tags, aplica permisos exactos y configura el descarte por política. Repetir con los mismos valores declara la misma topología; cambiar las contraseñas de integración las actualiza.

## Un usuario compartido

Para un plan que no permita gestionar usuarios, como Little Lemur según la [FAQ de CloudAMQP](https://www.cloudamqp.com/docs/faq/). Jim comprobará el panel y acordará la excepción temporal con G7 antes de intercambiar la credencial. Solo se necesitan las variables comunes. Desde la raíz del backend:

```powershell
$env:RABBITMQ_MODO = 'un-usuario'
node tools/rabbitmq/setup-broker.mjs
if ($LASTEXITCODE -ne 0) { throw 'Falló el setup' }
node tools/rabbitmq/publicar-evento-prueba.mjs usuario.creado
if ($LASTEXITCODE -ne 0) { throw 'Falló la publicación de prueba' }
node tools/rabbitmq/leer-cola.mjs 5
```

El setup solo declara exchanges, colas y bindings en el vhost existente. Usa `x-dead-letter-exchange` y `x-dead-letter-routing-key` en `marketplace.usuarios`. No llama a las API de usuarios, vhosts, permisos ni políticas. Repetir el mismo modo declara los mismos recursos. Si la cola ya existe con argumentos incompatibles, detenerse y coordinar la resolución antes de cambiar de modo. Ante un 401/403, revisar la cuenta y los permisos antes de repetir.

## Evidencia de prueba

El emisor admite `usuario.creado` (por defecto), `usuario.bloqueado` y `usuario.roles_cambiados`. Genera UUID sintéticos y exige `routed:true`. Publicación y lectura indican `modo`: **REAL** con el transporte de red por HTTPS fuera de loopback y **MOCK** con un doble en memoria o un destino loopback. La etiqueta describe el transporte al broker; el evento sigue siendo sintético y no demuestra publicación desde G7. El lector inspecciona ambas colas con `ack_requeue_true` (5 mensajes por omisión, máximo 10 por cola). Puede cambiar el orden visible o marcar una reentrega. Usarlo con el consumidor detenido. Solo imprime tipo, versión e ID del evento reconocido.

Pruebas **MOCK** con transporte en memoria:

```powershell
node --test tools/rabbitmq/broker.test.mjs
```
