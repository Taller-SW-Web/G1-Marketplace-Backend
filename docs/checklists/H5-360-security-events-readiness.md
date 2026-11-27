# H5-360 · preparación de prueba del consumidor de eventos

Esta guía prepara una PostgreSQL desechable para la prueba local posterior. **No habilita ni ejecuta el consumidor, no publica mensajes y no se conecta a RabbitMQ.**

## Bloqueo previo obligatorio

No definir `SECURITY_EVENTS_ENABLED=true` ni cargar `RABBITMQ_URL` hasta que Jim confirme que leyó en `marketplace.usuarios` el `usuario.creado` publicado por Christian y que ya rotó la credencial. Después, usar únicamente la URL nueva que Jim comparta por privado. Nunca guardarla en Git, `.env`, logs, capturas ni comandos que queden en el historial.

La compra real a Ventas sigue fuera de esta prueba y no debe ejecutarse antes del jueves a las 10:00.

## Preparar la base aislada, consumidor apagado

Usar una ventana de PowerShell dedicada desde la raíz del backend. El servicio publica PostgreSQL solo en loopback `127.0.0.1:55433`, usa la base `marketplace_security_events_test` y mantiene los datos en `tmpfs`; no comparte el contenedor, puerto ni base de `docker-compose.test.yml` (`marketplace_h3_test`, `55432`).

```powershell
# Solo si ya existía una instancia de esta compose: limpia su tmpfs para empezar vacía.
# No ejecutar mientras el proceso de prueba esté usando la base.
docker compose -f docker-compose.security-events-test.yml down
```

```powershell
docker compose -f docker-compose.security-events-test.yml up -d --wait postgres-security-events-test

$env:SECURITY_EVENTS_TEST_DATABASE_URL = 'postgresql://security_events_test:security_events_local_only@127.0.0.1:55433/marketplace_security_events_test?schema=public'
$env:SECURITY_EVENTS_ENABLED = 'false'

npm run security-events:db:check
npm run security-events:db:migrate
```

Los comandos `check` y `migrate` rechazan hosts/puertos/bases inesperados, colisiones con otra configuración de `DATABASE_URL` o `TEST_DATABASE_URL`, producción y cualquier intento de migrar con el consumidor habilitado. Se permite `DATABASE_URL` solo si coincide exactamente con la URL dedicada validada; la migración la fuerza de nuevo a ese valor. La contraseña mostrada arriba es sintética, local y exclusiva de este contenedor; no reutilizarla fuera de él.

Verificar que la migración creó la tabla, sin volcar contenido:

```powershell
docker compose -f docker-compose.security-events-test.yml exec -T postgres-security-events-test `
  psql -U security_events_test -d marketplace_security_events_test `
  -c "SELECT to_regclass('public.security_user_event_inbox') AS inbox_table;"
```

Resultado esperado: `security_user_event_inbox`. Si el motor de Docker no está disponible, detenerse y reportarlo; no sustituir esta base por desarrollo ni por `marketplace_h3_test`.

## Prueba real, solo después de la confirmación de Jim

1. Confirmar por escrito que Jim ya leyó el evento de Christian y que la credencial fue rotada. Recibir la `RABBITMQ_URL` nueva por privado.
2. Como el mensaje de las 23:00 ya habrá sido leído por Jim, **no asumir que sigue en la cola**. Antes de abrir la conexión, coordinar con Jim/G7 un nuevo evento de prueba no productivo o una redelivery expresamente autorizada. Si no hay mensaje acordado, dejar el consumidor apagado.
3. En **la terminal dedicada del único proceso local de prueba**, cargar desde el gestor/canal privado la URL nueva como variable de entorno. No escribirla inline, no usar `.env` y no habilitarla en otra sesión o despliegue.
4. En esa misma terminal, mantener `SECURITY_EVENTS_TEST_DATABASE_URL` en la URL validada arriba y copiarla a `DATABASE_URL`. Definir explícitamente `SECURITY_EVENTS_ENABLED=true`, `SECURITY_EVENTS_MAX_RETRIES=3`, `SECURITY_EVENTS_BACKOFF_BASE_MS=1000`, `SECURITY_EVENTS_BACKOFF_MAX_MS=30000` y `SECURITY_EVENTS_PREFETCH=1`; iniciar `npm run start:dev` solo en esa terminal:

   ```powershell
   $env:DATABASE_URL = $env:SECURITY_EVENTS_TEST_DATABASE_URL
   $env:SECURITY_EVENTS_ENABLED = 'true'
   $env:SECURITY_EVENTS_MAX_RETRIES = '3'
   $env:SECURITY_EVENTS_BACKOFF_BASE_MS = '1000'
   $env:SECURITY_EVENTS_BACKOFF_MAX_MS = '30000'
   $env:SECURITY_EVENTS_PREFETCH = '1'
   npm run start:dev
   ```

   `RABBITMQ_URL` se carga aparte desde el gestor/canal privado; no pegarla en este bloque ni guardarla en el historial.
5. Esperar el procesamiento del evento acordado. No ejecutar setup del broker, no publicar/reencolar mensajes manualmente y no hacer una compra a Ventas.
6. Revisar el resultado con una consulta agregada que no expone identificadores ni payload:

```sql
SELECT event_type, event_version, COUNT(*) AS stored_events,
       COUNT(DISTINCT event_id) AS distinct_events,
       MIN(received_at) AS first_received_at
FROM security_user_event_inbox
GROUP BY event_type, event_version;
```

Para una base recién creada y un único evento se espera una fila `usuario.creado`, versión `1`, con `stored_events = 1` y `distinct_events = 1`. No guardar `event_id`, `userId`, URL, credenciales ni cuerpo del mensaje como evidencia. Esta observación acredita la persistencia de esa entrega; la idempotencia de redelivery se cubre con `npm run test:unit -- --runTestsByPath src/security-events/security-user-event-inbox.service.spec.ts`. No provocar una redelivery real sin coordinarlo con Jim/G7.

## Apagado y limpieza

Al terminar, detener NestJS con `Ctrl+C`, confirmar que el proceso finalizó, y quitar las variables privadas de esa terminal:

```powershell
Remove-Item Env:RABBITMQ_URL -ErrorAction SilentlyContinue
Remove-Item Env:SECURITY_EVENTS_ENABLED -ErrorAction SilentlyContinue
Remove-Item Env:SECURITY_EVENTS_TEST_DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
docker compose -f docker-compose.security-events-test.yml down
```

`down` elimina el contenedor y los datos temporales en `tmpfs`. Cerrar la terminal dedicada al final para descartar cualquier variable de entorno que no se haya quitado. La evidencia permitida es el SHA probado, estado de checks y el resultado agregado sanitizado; no se captura el entorno de variables ni mensajes del broker.
