# Entorno Docker H3 — ejecución local del equipo

Indicación de Giuliano del 16/10/2026: preparar Docker para este corte y dejar Render fuera de la ejecución actual. No se crean servicios cloud. La conexión OAuth de Render puede permanecer configurada, pero no se utiliza para este entorno.

## Preparación

Instalar y abrir Docker Desktop con contenedores Linux y Docker Compose v2. Conservar Backend y Frontend como carpetas hermanas, ambos en feat/s1-f006-f007-catalogo. No hace falta instalar Node ni PostgreSQL en el host para arrancar estos contenedores.

Desde G1-Marketplace-Backend ejecutar:

```powershell
docker compose -f compose.h3.yaml up --build --detach --wait --wait-timeout 180
docker compose -f compose.h3.yaml ps
```

Abrir **http://localhost:3000** y **http://localhost:3000/catalogo**. Backend está en http://localhost:10000; /live y /ready deben responder 200, y /ready indica database.connected=true.

El fichero se llama compose.h3.yaml: no usar el docker-compose.yml antiguo para este flujo, porque sólo levanta PostgreSQL/Adminer e inicializa SQL de otra manera. El nuevo proyecto usa su propio volumen y aplica únicamente las migraciones Prisma existentes al arrancar Backend, sobre la BD del contenedor. No monta el SQL de inicialización antiguo ni una BD externa; evita duplicar la creación del esquema.

## Servicios y red

| Servicio | Contenedor / acceso |
|---|---|
| postgres | PostgreSQL 16, BD h3_local y volumen h3_postgres del proyecto g1-marketplace-h3; sin puerto publicado en el host |
| backend | NestJS compilado; puerto host 10000 enlazado sólo a 127.0.0.1 |
| frontend | Next compilado; puerto host 3000 enlazado sólo a 127.0.0.1 |

Compose crea la red y resuelve servicios por nombre. Dentro de frontend, localhost apunta al propio contenedor: por eso MARKETPLACE_API_URL=http://backend:10000 y MARKETPLACE_INTERNAL_HTTP_HOST=backend. La autorización HTTP interna está limitada al hostname configurado explícitamente en servidor; HTTPS y loopback conservan su comportamiento. No se acepta un destino HTTP arbitrario desde una petición del navegador ni se publica esa variable como NEXT_PUBLIC.

Los Dockerfiles usan Node 22.18.0 y etapas separadas de build/ejecución. El proceso de aplicación corre como usuario node. .dockerignore excluye .env, Git, node_modules del host, builds, reportes y next-env.d.ts local; el build Next genera su propio archivo en la imagen.

El catálogo se configura explícitamente MOCK, con NODE_ENV=development sólo en Backend para permitir fixtures. Frontend usa el servidor Next compilado con NODE_ENV=production; eso no convierte el entorno local del equipo en una publicación cloud. El nombre start:prod significa ejecutar el compilado y no identifica por sí solo la etapa académica del proyecto. Las credenciales h3/h3_fixture_only son exclusivamente las de la BD de pruebas aislada, no credenciales reales del equipo.

## Comprobar y detener

```powershell
docker compose -f compose.h3.yaml logs --tail 60 backend frontend
docker compose -f compose.h3.yaml exec backend node -e "fetch('http://127.0.0.1:10000/ready').then(async r=>console.log(r.status,await r.json()))"
docker compose -f compose.h3.yaml down
```

down conserva los datos del volumen para el siguiente arranque. No usar down -v para una parada normal: elimina los datos de este proyecto.

La comprobación de CI ejecuta scripts/check-docker-h3.mjs en el host del runner después del arranque. Verifica cuatro casos: readiness PostgreSQL, home y búsqueda a través de Next→Backend con fuente MOCK, y carrito anónimo con Set-Cookie. No consulta G6 ni un servicio ajeno. Los contenedores de CI se detienen siempre al terminar.

## Alcance de la demostración

Esta ejecución muestra Frontend→BFF→PostgreSQL propios y catálogo con fixtures, sin token de G6 ni emisor de identidad ficticia automático. Docker es la forma de ejecutar el entorno, no una sustitución de la integración REAL. Conectar G6 requiere configurar una URL accesible desde Backend, la identidad técnica y el contrato aprobados; el Compose actual no activa REAL ni inventa ese servicio.

Los documentos originales de H3 todavía exigen nube/URL pública y Productos REAL. La instrucción actual del equipo cambia el entorno a Docker; corresponde registrar con el responsable del hito qué evidencia se aceptará. Este ajuste no reescribe esas condiciones ni marca tareas Done. La presentación personal debe explicar Docker como entorno actual y mantener identificada la suposición de cierre usada en el ensayo.

## Archivo .env privado de Backend

Colocar el archivo con nombre exacto `.env` en la raíz Backend, junto a package.json. Git lo ignora y .dockerignore lo excluye del contexto de construcción: no se incorpora al repositorio ni a las imágenes. No utilizar `env` sin punto.

Compose carga ese archivo opcional sólo en el servicio backend mediante env_file. No lo necesita Frontend ni CI; si no existe, el entorno conserva sus fixtures. Requiere Compose 2.24 o posterior (la instalación local usa 5.6.0).

El bloque environment del Compose conserva la prioridad para DATABASE_URL (PostgreSQL interno), PORT, NODE_ENV, CORS_ORIGINS, CATALOG_SOURCE=mock y USE_MOCKS. Guardar una URL de BD externa en .env no redirige las migraciones de este entorno. Las otras variables se cargan en Backend sin publicarlas en Next. La presencia de un campo en .env no significa que la aplicación implemente su flujo de autenticación ni habilita automáticamente Productos REAL.

Después de modificar .env, recrear los servicios para que lean sus valores nuevos:

```powershell
docker compose -f compose.h3.yaml up --detach --wait --wait-timeout 180
```

No hace falta reconstruir las imágenes por un cambio de configuración. Para verificar sólo sintaxis, usar `docker compose -f compose.h3.yaml config --quiet`: la salida completa de config o inspect puede mostrar valores privados y no debe publicarse como evidencia. No copiar el archivo a artefactos, guías ni descripciones de PR.

## Conexion preparada con G6

El override opcional `compose.h3.g6.yaml` permite seleccionar REAL sin modificar este entorno MOCK. Usarlo solo con configuracion aprobada siguiendo [la guia de integracion G6](INTEGRACION-G6-H3.md). Incluye ensayo HTTP local, comandos de comprobacion sin credenciales en el navegador y retorno a MOCK. La configuracion base sigue siendo la usada por CI.
