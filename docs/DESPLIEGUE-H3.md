# Despliegue del corte H3 de catálogo

> **Entorno actual solicitado: Docker local.** Render queda como referencia futura. Consultar [Docker H3](DOCKER-H3.md) para levantar los tres servicios. No se ha desplegado en Render.

Preparación técnica del 16/10/2026 en las ramas individuales de Giuliano. No acredita despliegue, integración REAL, aprobación ni cierre H3. Los PR #11 Backend y #3 Frontend siguen en draft hacia develop. No desplegar main: Backend/main conserva la aplicación anterior.

## Versiones y composición

Backend incorpora develop `e6fc7f25e78a8b34316096839f44863f37f5e2c9`: CartModule, guards RS256, bootstrap y configuración del equipo, junto con CatalogModule. Frontend incorpora develop `843dfde7a4e52e1a836db0eb207d8f9aa3502c28`: carrito, estilos, alias de Vitest y lockfile del equipo, conservando catálogo e imagen opcional. Elegir la revisión probada de cada rama; el workflow FE fija el SHA Backend correspondiente.

## Backend / Render

- Node 22.18.0; `npm ci --include=dev && npm run build && npm prune --omit=dev`.
- Arranque: `npm run prisma:deploy && npm run start:prod`. Se restaura start:prod, eliminado por la actualización de develop; apunta a `node dist/main.js`.
- Migraciones únicamente sobre la BD autorizada del entorno. Las verificaciones locales de esta adaptación no ejecutan migraciones de Render ni de terceros; CI usa PostgreSQL desechable.
- DATABASE_URL PostgreSQL real, NODE_ENV=production, PORT asignado por el proveedor y CORS_ORIGINS con los orígenes web autorizados. No copiar la URL sintética de pruebas.
- Health check `/live` comprueba el proceso. `/ready` debe responder 200 con database.connected=true para acreditar BD disponible; un /live 200 no acredita catálogo ni integración.
- Catálogo funcional: CATALOG_SOURCE=real y valores homologados de CATALOG_INTEGRATION_APPROVED=true, PRODUCTOS_BASE_URL (origen HTTPS sin /api/v1), PRODUCTOS_SERVICE_TOKEN, PRODUCTOS_CONTRACT_VERSION=0.6.0-rc.1, PRODUCTOS_CONTRACT_SHA=f64bfe9a097b2a0f74c2600988305443d92f640e, PRODUCTOS_MEDIA_HOSTS y PRODUCTOS_TIMEOUT_MS (100–30000, defecto 5000). El token sólo se configura en Backend mediante el canal seguro del entorno.
- Sin esos datos, el servidor puede iniciar con CATALOG_SOURCE=unconfigured y devolver 503 de catálogo: eso es infraestructura disponible, no H3 funcional. No habilitar MOCK en producción ni cambiar a fixtures ante fallos REAL.

## Frontend / Next

Hosting con servidor Next y Route Handlers; no exportación HTML estática. Build `npm ci && npm run build`; arranque `npm run start` con el puerto del proveedor. MARKETPLACE_API_URL es el origen HTTPS del Backend Marketplace desplegado, sólo del servidor. No poner tokens G6 en NEXT_PUBLIC ni en Frontend.

El proxy de carrito ya no consulta MOCK_AUTH_URL ni obtiene /token?user=default. Sin Authorization reenvía la cookie de sesión y Backend utiliza su carrito anónimo; Set-Cookie se conserva en la respuesta. Si el llamador proporciona Authorization, lo reenvía sin reemplazarlo y preserva el 401 del Backend: nunca cambia una credencial rechazada por una identidad de prueba. La autenticación de usuario y su sesión real siguen bajo el contrato del bloque de acceso; no se implementa un login nuevo con este ajuste.

Para peticiones autenticadas, AUTH_ISSUER/AUTH_JWKS_URL de Backend deben corresponder al servicio autorizado. Los valores loopback del ejemplo sólo sirven para el emisor local de prueba. El carrito anónimo no necesita consultar JWKS.

## Verificación antes de declarar funcional

1. Probar las revisiones exactas y registrar los runs CI. Las suites locales/CI usan fixtures o proveedores controlados.
2. Configurar y desplegar las revisiones aprobadas mediante el responsable OPS. Desplegar FE compatible con image:null antes de habilitar respuestas nullable del catálogo compartido.
3. Comprobar /live, /ready y web→Next→BFF→Productos real con resultados, categoría, búsqueda, paginación, imagen ausente, vacío y error. Conservar evidencia sanitizada y revisiones; nunca tokens ni logs crudos.
4. Probar carrito anónimo y aislamiento de sesiones en la BD del entorno. No presentar los datos comerciales sintéticos de otros bloques como datos G6.
5. Completar revisión independiente, seguridad/DAST autorizado y aceptación con sus responsables. Este documento y los PR draft no sustituyen esos pasos.

El smoke local tiene modo test (fixtures) y H3_SMOKE_MODE=production (catálogo sin credenciales, sin fallback). Usa puertos 10101/10102 y genera reportes separados. El caso production valida configuración de ejecución y fallo cerrado; no llama a G6 ni acredita conectividad real o un despliegue.
