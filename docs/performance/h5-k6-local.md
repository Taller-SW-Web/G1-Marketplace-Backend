# H5 #301/#302 · perfiles k6 locales

Los perfiles versionan recetas de carga para **servicios propios G1**. Los scripts no se han ejecutado ni generan resultados de performance. No se autorizó entorno/ventana para la corrida final #306.

## Requisitos locales

- Instalar k6 siguiendo la [guía oficial de Grafana](https://grafana.com/docs/k6/latest/set-up/install-k6/). En Windows se puede usar `winget install k6` o `choco install k6`; en Linux, seguir el paquete oficial para la distribución. Verificar con `k6 version`.
- Para los perfiles de catálogo, el valor inicial esperado por los fixtures es `zapatillas-running-aero-x`; establecer `PERF_PRODUCT_SLUG` si el catálogo local usa otro slug sembrado.
- El backend debe usar dobles/fixtures locales para **todas** sus dependencias. No arrancarlo apuntando a proveedores o despliegues, aunque `PERF_BASE_URL` sea loopback.

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
| authenticated idempotent order | 1 VU por 1 min; quote/preparation una vez y replay secuencial | `POST /checkout/orders` dos veces con el mismo UUID por operación | Igual; éxito si ambos status se aceptan y el replay devuelve el mismo `orderId` |

Los valores son perfiles iniciales, no SLO aprobados ni mediciones. La corrida de aceptación necesita autorización explícita, ventana, SHA de backend/frontend si aplica, entorno local aislado, configuración MOCK comprobada y reporte sanitizado.

## Ejecución futura (no ejecutada)

Tras aprobar el gate y arrancar el backend **local** aislado con fixtures, establecer `PERF_MOCK_MODE=true`, `PERF_RUN_AUTHORIZED=1` y `PERF_BASE_URL=http://127.0.0.1:10000`. Ejecutar de a un perfil:

```text
npm run perf:k6:load
npm run perf:k6:stress
npm run perf:k6:spike
```

Para el soak, establecer además `PERF_ACCESS_TOKEN` con un token sintético/local de prueba y luego ejecutar `npm run perf:k6:soak`. No almacenar el token en shell history, archivo, CI log ni reporte. El token se valida de forma sintáctica; k6 no llama al emisor para obtenerlo.

El perfil de pedido requiere un carrito y dirección sintéticos ya sembrados en el backend local (`PERF_CHECKOUT_ADDRESS_ID`, `PERF_CART_VERSION`, `PERF_CART_SESSION`) y un token local que sea propietario del carrito. Proporcionar UUIDv4 distintos para `PERF_PREPARATION_IDEMPOTENCY_KEY` y `PERF_ORDER_IDEMPOTENCY_KEY`; el `setup()` crea una cotización y una preparación local, y el escenario repite el mismo pedido con la misma clave para comprobar el replay. Cada ejecución debe usar claves nuevas. Se usa un contacto sintético fijo, no datos personales. Ejecutar con `PERF_MOCK_MODE=true`, `PERF_RUN_AUTHORIZED=1` y `PERF_BASE_URL` loopback; nunca apuntar este perfil a un despliegue.

Ejecutar el perfil de pedido solo después de preparar el backend local aislado y los valores sintéticos anteriores:

```text
npm run perf:k6:order
```

El perfil no registra tokens, cookies, claves de idempotencia ni cuerpos de respuesta. La prueba estática no ejecuta k6 ni envía tráfico.

La comprobación estática no genera tráfico: `npm run test:h5-k6:static`.
