# H5 #301/#302 · perfiles k6 locales

Los perfiles versionan recetas de carga para **servicios propios G1**. Los scripts no se han ejecutado ni generan resultados de performance. No se autorizó entorno/ventana para la corrida final #306.

## Seguridad y frontera

- Todos los perfiles exigen `PERF_MOCK_MODE=true`, `PERF_RUN_AUTHORIZED=1` y `PERF_BASE_URL` con HTTP en `127.0.0.1` o `[::1]`; se rechazan DNS, `localhost`, HTTPS, rutas, credenciales, query y fragmentos antes de hacer solicitudes.
- El backend local debe estar configurado explícitamente con dobles/fixtures para **todas** las dependencias. El loopback del cliente por sí solo no impide que un G1 mal configurado haga egress a un proveedor; comprobar esa configuración antes de una corrida y no arrancar contra despliegues.
- `authenticated-soak.js` solo hace `GET` a carrito y favoritos, requiere un token de cuenta sintética/local por `PERF_ACCESS_TOKEN` y no imprime token, cabeceras ni respuestas. Nunca pasar credenciales reales ni PII.
- Los perfiles solo descartan cuerpos y validan status/umbrales. No hay llamadas a G5/G6/G7/G2 desde el código k6; no ejecutar durante este gate local.

## Perfiles y umbrales

| Perfil | Escenario | Rutas G1 | Umbrales |
|---|---|---|---|
| load | 0→10→20→0 VUs, 2 min | home, búsqueda, detalle | p95 < 800 ms; errores < 1%; éxito > 99% |
| stress | 0→10→30→60→100→0 VUs, 2 min 30 s | home, búsqueda, detalle | Igual; un incumplimiento hace fallar k6 |
| spike | 5→10, salto a 100 VUs, sostenido y descenso, 2 min 20 s | home, búsqueda, detalle | Igual |
| authenticated soak | 5 VUs constantes por 10 min | `GET /carts/current`, `GET /wishlist` | Igual; requiere token sintético |

Los valores son perfiles iniciales, no SLO aprobados ni mediciones. La corrida de aceptación necesita autorización explícita, ventana, SHA de backend/frontend si aplica, entorno local aislado, configuración MOCK comprobada y reporte sanitizado.

## Ejecución futura (no ejecutada)

Tras aprobar el gate y arrancar el backend **local** aislado con fixtures, establecer `PERF_MOCK_MODE=true`, `PERF_RUN_AUTHORIZED=1` y `PERF_BASE_URL=http://127.0.0.1:10000`. Ejecutar de a un perfil:

```text
npm run perf:k6:load
npm run perf:k6:stress
npm run perf:k6:spike
```

Para el soak, establecer además `PERF_ACCESS_TOKEN` con un token efímero de sandbox local autorizado y luego ejecutar `npm run perf:k6:soak`. No almacenar el token en shell history, archivo, CI log ni reporte. El token se valida de forma sintáctica; k6 no llama al emisor para obtenerlo.

La comprobación estática no genera tráfico: `npm run test:h5-k6:static`.
