# Resultado observado — PostgreSQL y artefacto compilado

Fecha: 16/10/2026. Clasificación: identidad/elegibilidad MOCK; HTTP, Prisma y PostgreSQL REAL local.

## Integración

Comando: `npm run test:integration` con TEST_DATABASE_URL del compose temporal, después de validar que difiere de la base de desarrollo.

Resultado final: código 0; 1 suite aprobada, 5 pruebas aprobadas. Migración `0_init` aplicada en el primer arranque; repetición sin migraciones pendientes. Servidor PostgreSQL verificado por `SHOW server_version` con prefijo 16.

Casos aprobados:

1. Readiness real devuelve 200 con `status: "UP"`, `service`, `environment`, `database.connected` y `timestamp` en `/`, `/health` y `/ready` (verificado nuevamente tras la auditoria del PR #15).
2. POST crea, repetición mantiene UUID/createdAt, el registro permanece después de cerrar/recrear la aplicación, DELETE repetido termina sin fila.
3. Diez solicitudes POST concurrentes: un 201, nueve 200 y una fila en PostgreSQL.
4. B no elimina registro A; A y B pueden guardar el mismo producto independientemente.
5. Sin token, producto inactivo/inexistente, proveedor indisponible y customerId enviado en body no dejan filas.

No se modificó el esquema ni se reinicializó la base de desarrollo. El runner solo permite una base local `marketplace_h3_test`; los tests limpian favoritos de clientes ficticios A/B.

## Smoke del ejecutable compilado

Comando: `npm run test:smoke` con TEST_DATABASE_URL temporal. Ejecuta `node dist/main.js` como proceso hijo en puerto local libre, genera un secreto aleatorio y tokens solo en memoria. Finaliza únicamente su proceso hijo.

Resultado observado: código 0.

| Operación | HTTP observado |
|---|---:|
| Health con PostgreSQL real | 200 |
| Asegurar favorito de prueba ausente | 204 |
| Crear | 201 |
| Repetir guardado | 200 |
| Eliminar | 204 |
| Repetir eliminación | 204 |
| Agregar sin token | 401 |
| Producto inactivo | 404 |
| Elegibilidad no disponible | 503 |

Este resultado acredita un arranque local real del artefacto compilado; no es despliegue Render ni integración real con Seguridad/Productos.
