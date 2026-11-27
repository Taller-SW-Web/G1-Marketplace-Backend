# TASK-F010-INT-001 — paginación BFF con universo de dos productos

**Fecha:** 27/11/2026 UTC. **Issue:** [Backend #61](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/61). **Responsable/revisor:** Giuliano Macchiavello / Sebastian Malca. La issue sigue abierta.

## Evidencia reutilizada y avance específico

No repetí las lecturas de las páginas 0 y 1: la [matriz Backend #57 del 27/11](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/e6b3eb9a3bc816510bc23c7126951799aab8eef9/docs/evidencias/H4/giuliano/2026-11-27/TASK-F009-INT-001-g6-tiebreak.json) ya registra el mismo universo y BFF `REAL` con `pageSize=1`, `totalElements=2`, `totalPages=2`: página BFF 0 devuelve `8ad24563-c9da-4305-b650-1dd47a14fffb` y página 1 devuelve `93f7f500-077d-432e-be98-31cb9ee0d66d`. Los IDs son distintos; la lectura de la primera página fuera de rango debe devolver cero productos.

También está el [retest BFF publicado del 26/11, enlazado en #61](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/61#issuecomment-7205472253): páginas visibles 1 y 2 con los dos productos y página 3 vacía, tamaño 1, total 2. Su [JSON](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/8d9f5df5a537cdd8d1951e8cb4c2f8216c8e7e46/plan/evidencias/h5-giuliano-catalogo/retest-real-render.json) registra 200/REAL, IDs mediante slugs y vacío para `F010-pagina-3`; el reporte no conserva la estructura completa `page` del BFF.

## Retest adicional del 27/11: primera página fuera de rango

Ejecuté una única petición de solo lectura al BFF Render con `q=G6 QA Marketplace Desempate`, `page=2`, `pageSize=1`, `sort=NAME_ASC`. Esta es la primera página inválida con `totalPages=2` e índice cero basado. El proveedor, según [`provider.ts`](../../../../../src/catalog/provider.ts), mapea `page+1` a G6 `pagina=3`, `pageSize=1` a `tamanio=1` y `NAME_ASC` a `orden=NOMBRE_ASC`.

**Resultado observado hoy:** `BLOCKED / NETWORK_OR_TIMEOUT` tras 20 005 ms. No llegó estado HTTP ni cuerpo. No es una respuesta 503 ni prueba de indisponibilidad de G6; no se reintentó ni se llamó directamente a G6.

La estructura que espera el contrato si la lectura responde y el total continúa en 2 es HTTP 200 con:

```json
{
  "sort": "NAME_ASC",
  "data": [],
  "page": {
    "number": 2,
    "size": 1,
    "totalElements": 2,
    "totalPages": 2
  }
}
```

El índice solicitado se conserva en la respuesta API vacía. La [traza JSON del intento de hoy](TASK-F010-INT-001-page2.json) separa el timeout observado de la forma esperada derivada del contrato. El retest del 26/11 aporta la observación HTTP 200/REAL vacía anterior, pero no reemplaza una respuesta completa nueva tras el timeout de hoy.

## Reproducción

```sh
npm run check:catalog:f010-out-of-range -- \
  --base-url https://g1-marketplace-backend.onrender.com \
  --output docs/evidencias/H4/giuliano/2026-11-27/TASK-F010-INT-001-page2.json
```

El runner envía solo un `GET` sin cookies ni credenciales, valida fuente `REAL`, `no-store`, correlación y la estructura vacía prevista. Un timeout queda `BLOCKED`; no se convierte en PASS ni en 503.

## BFF API y UI publicada

La API tiene evidencia REAL para página BFF 0 y 1 en #57; el retest #61 del 26/11 observó también la página vacía fuera de rango y las tarjetas de Vercel en las dos páginas válidas. Esta actualización no vuelve a probar la UI. No queda comprobado desde el navegador publicado el enlace de recuperación OPEN-03 para `page=2`, la vuelta a primera página ni el cambio/reset de URL al cambiar criterios; siguen pendientes. La API vacía por sí sola no demuestra ese comportamiento de UI.

## Estado y límites

Backend #60 está cerrada; la dependencia formal #49 permanece abierta. #61 sigue abierta y el tablero conserva **Bloqueado**; no se cambian el DoD, responsable, revisor ni estado. No se confirmó SHA desplegado para las respuestas actuales, concesiones/upstream, ni snapshot entre solicitudes. Hace falta un retest API completo del page 2 tras el timeout, además de la verificación UI publicada/reset/URL, aceptación independiente y dependencias OPS aplicables.
