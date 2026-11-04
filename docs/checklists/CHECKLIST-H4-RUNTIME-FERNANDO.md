# H4 — Preflight runtime Backend (Fernando)

**Estado:** preparación documental local; no acredita deploy, smoke cloud ni rollback probado.
**Issue:** [Backend #215 — TASK-TRANS-S02-OPS-003](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/215).
**Rama:** `feat/f028-f035-fernando-backend` · **Revisor requerido:** Andres Morales.

## Estado inspeccionado

- `render.yaml` define el servicio `g1-marketplace-backend`, Postgres 16, `startCommand: npm run prisma:deploy && npm run start:prod` y health check `/live`.
- `GET /live` sólo confirma que el proceso responde. `GET /ready` (también `/health`) ejecuta `SELECT 1`; para estar listo debe responder HTTP 200 y `database.connected=true`.
- El `.env.example` mantiene `AUTH_ENABLED=false`, `ORDERS_SOURCE=unconfigured` y `CATALOG_SOURCE=unconfigured`; `BFF_MODE=mock` y `USE_MOCKS=true` son flags preexistentes del demo local H3. Ninguno acredita integración REAL. F-031 dispone de endpoint y recibo transaccional por pedido, pero `REORDER_ENABLED=false` y `REORDER_SOURCE=unconfigured`; sus fixtures/mock sólo se pueden habilitar en `NODE_ENV=test`, nunca durante el runtime local, y no hay integración G6. F-034 encola transaccionalmente sólo con `ORDER_CONFIRMATION_OUTBOX_ENABLED=true`, apagado por defecto. Existe lógica de worker por lote, pero `NOTIFICATION_WORKER_ENABLED=false`, sin scheduler ni proveedor G-MAIL; G2/G-MAIL permanecen apagados.
- Esta rama añade tres migraciones aditivas: columna cifrada en `checkout_operations` (`20261104000100_checkout_notification_recipient`), recibos de recompra (`20261104000200_cart_reorder_operations`) y campos/estados del worker (`20261104000300_notification_delivery_worker`). Las siete migraciones se aplicaron desde cero únicamente en PostgreSQL 16 temporal y desechable para probar; no se aplicaron a DB compartida. Antes de desplegarlas, auditar primero el estado e historial de migraciones del servicio Render y la base asociada.
- No se consultó ni modificó Render. URL pública del servicio, SHA desplegado, identificador de artefacto y corrida de CI/CD siguen sin evidencia en este corte.

## Variables a comprobar antes del deploy

| Variable | Fuente/valor esperado | Comprobación |
|---|---|---|
| `DATABASE_URL` | Conexión PostgreSQL administrada por el entorno | Nunca copiarla al repositorio, logs o evidencia. |
| `NODE_ENV` | `production` | Impide activar fixtures de sandbox y proveedores mock. |
| `PORT` | Puerto asignado por el runtime; `render.yaml` declara 10000 | El proceso debe escuchar el puerto provisto por Render. |
| `CORS_ORIGINS` | Origen exacto del Frontend desplegado | Sin comodines ni URLs localhost. |
| `USE_MOCKS` | `false` en producción | No convertir fallas reales en datos de prueba. |
| `H3_SANDBOX_ENABLED` | `false` en producción | El validador rechaza sandbox fuera de `development`/`test`. |
| `AUTH_ENABLED` | `true` sólo cuando G7 esté configurado y aprobado | No combinar con `H3_AUTH_MOCK` ni sandbox. |
| `G7_API_URL`, `G1_WEB_ORIGIN`, `AUTH_ISSUER`, `AUTH_JWKS_URL`, `AUTH_SESSION_KEY` | Valores aprobados por G7 y secreto privado de 32 bytes | No usar valores de ejemplo/loopback; no revelar claves. |
| `ORDERS_SOURCE` | `unconfigured` hasta la prueba autorizada; `g5` sólo tras aprobar sesión/G5 | `g5` requiere `AUTH_ENABLED=true` y `G5_API_URL` HTTPS. No hay token G5 fijo. |
| `CATALOG_SOURCE` | `unconfigured` hasta cerrar contrato y grant G6 | No usar `mock` en producción. |
| `REORDER_ENABLED`, `REORDER_SOURCE` | `false` / `unconfigured` | Fixtures/mock de recompra sólo en `NODE_ENV=test`; `ORDERS_SOURCE=mock` es requerido. Mantener apagado durante el runtime local y desplegado. |
| `ORDER_CONFIRMATION_OUTBOX_ENABLED` | `false` por defecto | Sólo considerar `true` tras aprobar G-MAIL/worker y configuración de secretos; no hay worker en esta rama. |
| `NOTIFICATION_EMAIL_ENCRYPTION_KEY` | Secreto privado, 32 bytes hex sólo si se habilita la outbox | Nunca registrar ni versionar el valor. La migración de columna cifrada no se ha aplicado. |

Las variables adicionales condicionales —introspección G7, G6 o correo— se habilitan sólo con sus propios contratos, secretos y pruebas aprobados; no se agregan valores ficticios para completar un deploy.

## Secuencia de verificación

1. Registrar rama, SHA Backend y Frontend, revisión de CI, artefactos, URL del servicio y entorno objetivo. Confirmar que los cambios recibieron revisión independiente.
2. Revisar en Render el servicio y la base de datos realmente asociados. Comparar la versión desplegada y el estado de migraciones antes de iniciar una migración; no corregir ni resetear una base compartida durante un smoke.
3. Confirmar variables por nombre y resultado de validación, sin exportar ni adjuntar sus valores secretos. Verificar que no hay `mock`, sandbox ni credenciales de prueba habilitadas en producción.
4. Después del deploy autorizado, consultar liveness y readiness:

   ```powershell
   $BackendServiceUrl = "https://<host-aprobado>"
   Invoke-RestMethod "$BackendServiceUrl/live"
   Invoke-RestMethod "$BackendServiceUrl/ready"
   ```

   Registrar hora, status HTTP, `service`, `environment` y `database.connected`; omitir headers de autorización, URL de base, correos y cuerpos sensibles.

5. Ejecutar smoke mínimo de las rutas aprobadas desde Frontend/BFF y API. Para pedidos, un `/live` o `/ready` verde no prueba autorización, ownership ni conexión funcional con G5. La prueba REAL necesita sesión de cliente autorizada y casos propios/ajenos/error coordinados.
6. Si falla el health check, readiness o smoke, detener el avance, guardar SHA y respuesta sanitizada y coordinar rollback con Andres. Usar el último deploy conocido como sano según el procedimiento autorizado del servicio; evaluar compatibilidad de esquema antes de revertir una aplicación. No ejecutar rollback de base de datos a ciegas.
7. Repetir el smoke sobre la revisión recuperada y registrar el resultado. Cierre de #215 requiere deploy/recuperación observados y revisión de Andres; esta lista sola no cierra la issue.

## Evidencia pendiente para completar #215

| Evidencia | Estado |
|---|---|
| SHA Backend/Frontend y CI asociado | Pendiente |
| URL de entorno y revisión desplegada | Pendiente; no consultado |
| Validación de variables por entorno | Pendiente; no se registraron valores |
| `/live` y `/ready` en cloud | Pendiente |
| Smoke UI/BFF/API aprobado | Pendiente |
| Ejercicio de rollback y verificación posterior | Pendiente |
| Revisión de Andres | Pendiente |

No registrar tokens, cookies, correos, URL de `DATABASE_URL` ni trazas sin sanitizar.
