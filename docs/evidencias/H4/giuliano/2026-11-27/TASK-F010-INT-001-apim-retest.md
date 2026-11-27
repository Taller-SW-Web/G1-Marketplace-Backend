# TASK-F010-INT-001 (#61): retest REAL de página fuera de rango

Fecha: 2026-11-27 (UTC)
Repositorio: `Taller-SW-Web/G1-Marketplace-Backend`

## Preflight y corte

- #61 permanece abierta. Dependencia backend #60 cerrada; dependencia formal #49 abierta. La decisión del PO permite revisar #61 separada de #45 al acreditar el criterio propio; no se modifica el estado ni las dependencias formales.
- Universo conocido de G6: dos productos para `G6 QA Marketplace Desempate`, con `totalElements=2` y `totalPages=2` cuando `pageSize=1`.
- BFF Render: `https://g1-marketplace-backend.onrender.com`; SHA live revisado en Render: `bcac2f6b279954c43bfa067a773c6629c6bbc502`.

## GET de página fuera de rango

Se envió una única petición GET de lectura, sin credenciales, con timeout de 8 s:

```text
/api/v1/catalog/products?q=G6%20QA%20Marketplace%20Desempate&page=2&pageSize=1
```

Hora cliente: `2026-11-27T18:47:23.037306Z`–`2026-11-27T18:47:25.742044Z`.

| Comprobación | Resultado |
|---|---|
| HTTP / fuente | `200` / `REAL` |
| `X-Request-Id` | `297754b6-b1f4-4786-8505-bf7031aec24b` |
| `Cache-Control` | `no-store` |
| `sort` | `null` |
| Página | `number=2`, `size=1`, `totalElements=2`, `totalPages=2` |
| Productos | `data=[]` (0 productos) |

Render confirmó el mismo ID para `GET /api/v1/catalog/products`, HTTP 200 / REAL, con duración de 2.336 s. La respuesta al cliente no incluyó correlación upstream de G6. El resultado coincide con el comportamiento esperado para página 2, fuera del rango de páginas 0–1, sin alterar el total.

## Límite de validación Vercel / OPEN-03

El corte Vercel indicado en el contexto de Andrés usa el SHA FE `ce72b5d73e422dae77f56c4e6edb04983377dc31`. Se intentó una única navegación a:

```text
https://g1-marketplace-frontend.vercel.app/catalogo?q=G6%20QA%20Marketplace%20Desempate&page=2&pageSize=1
```

La herramienta del navegador continuó pendiente a los 14 s; se canceló antes del límite de 15 s. No se obtuvo status, snapshot, URL final, SHA de runtime ni interacción. No se hizo click en “Volver a la primera página” y no se puede confirmar visualmente el reset de página, la conservación de `q` en la URL ni OPEN-03 en este corte. Este límite no demuestra una falla de Vercel y la navegación no se repitió.

## Alcance

El caso API fuera de rango queda acreditado en el corte REAL revisado. La validación UI de reset/URL/OPEN-03 sigue sin evidencia observada en esta sesión; no se declara cubierto ese criterio ni se cierra #61. No se modificaron estados, etiquetas ni asignaciones.
