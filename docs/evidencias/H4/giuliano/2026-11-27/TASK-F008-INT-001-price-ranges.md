# TASK-F008-INT-001 — alcance del retest REAL de precio, 27/11/2026

Responsable: Giuliano Macchiavello. [Backend #53](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/53) continúa abierto; no se modifica su DoD ni estado. Dependencia Backend #52: cerrada. I-01 y la dependencia formal Backend #49 continúan pendientes.

## Dataset y contrato revisado

G6 confirmó para este retest dos productos con el mismo nombre, categoría y marca:

| Slug / SKU | Product ID | Precio confirmado por G6 |
| --- | --- | ---: |
| `g6-qa-marketplace-ord-001` / `G6-QA-MP-ORD-001` | `93f7f500-077d-432e-be98-31cb9ee0d66d` | S/ 39.90 |
| `g6-qa-marketplace-ord-002` / `G6-QA-MP-ORD-002` | `8ad24563-c9da-4305-b650-1dd47a14fffb` | S/ 49.90 |

El BFF recibe `minPrice` y `maxPrice` en PEN y [mapea](../../../../../src/catalog/provider.ts) a G6 `precioMin` y `precioMax`. La página del BFF es base cero: `page=0` se convierte en `pagina=1`; `pageSize=24` se envía como `tamanio=24`; `NAME_ASC` se envía como `NOMBRE_ASC`. El [contrato local](../../../../contratos/openapi-catalogo-h4.json) valida formato, valores no negativos y `minPrice <= maxPrice`, pero no declara si los extremos son inclusivos. Por eso se eligieron rangos que no coinciden con los precios conocidos; esta prueba no determina la inclusión de límites.

## Evidencia previa y retest pendiente de respuesta

La [traza pública Render del 26/11](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/8d9f5df5a537cdd8d1951e8cb4c2f8216c8e7e46/plan/evidencias/h5-giuliano-catalogo/retest-real-render.json), enlazada en [el comentario de #53](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/53#issuecomment-7205471626), registra `X-Catalog-Source: REAL` y HTTP 200 para los rangos S/ 0–100 (2 productos), S/ 0–60 (2) y S/ 0–45 (sólo el producto `ord-001`). Esa traza guarda los slugs y totales, pero no los IDs ni la metadata `page.number`, `page.size` y `page.totalPages` de las respuestas filtradas. La [evidencia REAL de F-009](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/e6b3eb9a3bc816510bc23c7126951799aab8eef9/docs/evidencias/H4/giuliano/2026-11-27/TASK-F009-INT-001-g6-tiebreak.json) relaciona ambos slugs con sus IDs en respuestas BFF sin filtro de precio y confirma el orden `ord-002` → `ord-001` para `NAME_ASC`.

Se preparó el runner [`retest-f008-price-ranges.mjs`](../../../../../scripts/catalog-h4/retest-f008-price-ranges.mjs) para completar únicamente los datos faltantes de los rangos 0–60 y 0–45: IDs y metadata de página junto al filtro. En 0–60, el orden esperado para `NAME_ASC` es `ord-002` (`8ad24563-c9da-4305-b650-1dd47a14fffb`) → `ord-001` (`93f7f500-077d-432e-be98-31cb9ee0d66d`), por desempate ascendente de `product_id`; el runner compara la secuencia completa en ese orden, no sólo el conjunto de IDs. El [JSON reproducible](TASK-F008-INT-001-price-ranges.json) registra un solo intento GET al BFF público Render (`https://g1-marketplace-backend.onrender.com`) con `q=G6 QA Marketplace Desempate`, `page=0`, `pageSize=24`, `sort=NAME_ASC`, `minPrice=0`, `maxPrice=60`, `X-Request-Id` y sin Authorization ni cookies. El fetch falló en 72 ms sin recibir respuesta HTTP (`NETWORK_OR_TIMEOUT`); la búsqueda DNS local `getent ahosts g1-marketplace-backend.onrender.com` terminó con código 2 y sin direcciones. El caso 0–45 quedó `NOT_RUN_AFTER_BLOCK`; no se reintentó ni se consultó G6 directamente.

**Resultado de este corte: BLOCKED para completar los IDs y metadata de página bajo filtro.** No se afirma que el endpoint haya respondido, que el filtro actual siga pasando ni que el caso no ejecutado haya resultado. La evidencia del 26/11 es un antecedente exitoso, no una respuesta de esta corrida.

## Validación y frontera pendiente

- `node --check scripts/catalog-h4/retest-f008-price-ranges.mjs`: PASS.
- `npm run check:catalog:f008-price-ranges -- --timeout-ms 20000 --output docs/evidencias/H4/giuliano/2026-11-27/TASK-F008-INT-001-price-ranges.json`: BLOCKED en el primer GET; comando guardó el resultado y detuvo el segundo caso.
- `git diff --check`: PASS.

Para completar el retest propio falta un entorno con DNS/red hacia el BFF Render y volver a ejecutar los dos GET de alcance limitado (0–60 y 0–45), registrando `X-Catalog-Source`, correlación, IDs y metadata de página. La issue sigue abierta por su DoD de integración y las dependencias formales I-01/#49; no se acredita aceptación independiente, revisión del corte, UI publicada/reset ni SHA de despliegue.
