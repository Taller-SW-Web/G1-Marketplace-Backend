# F013 REAL desde el detalle comercial de G6

El 06/11 a las 11:34 Lima faltaban los textos de Color/Talla. El retest de las **12:13 Lima** encontró corregidos los 16 productos con variantes: 51 variantes y valores legibles en `identifying_attributes[].valor.nombre`. No se deducen etiquetas del SKU ni de los UUID.

El adaptador usa el mismo GET que F011:

```text
/api/v1/productos/por-slug/{slug}?canal=MARKETPLACE
```

Conserva el endpoint G1 `/api/v1/catalog/products/{slug}/variants`, su DTO y el frontend existentes. No añade servicios, rutas de proveedor, permisos, dependencias ni flags. No implementa precio o disponibilidad.

## Mapeo y límites

- `product_id` → `productId`; `tiene_variantes` → `hasVariants`.
- `variant_id` y `sku` se conservan como identidades distintas.
- `identifying_attributes` construye los atributos y sus valores: `caracteristica_id`/`nombre`, `valor_id` y el texto autoritativo de `valor.nombre`. El ID anidado debe coincidir. También se admiten valores escalares legibles suministrados por G6.
- Las combinaciones usan IDs, las opciones visibles usan etiquetas. Valores duplicados se agrupan por ID sin perder sus variantes. Una etiqueta contradictoria, combinación incompleta/duplicada, SKU/variantId repetido o etiqueta ausente rechaza toda la respuesta con 502; no produce un selector parcial.
- Las imágenes opcionales mantienen HTTPS y la allowlist exacta de hosts. La respuesta sólo contiene campos de F013, nunca precios, stock ni disponibilidad.
- Un producto simple conserva el contrato actual: `hasVariants=false`, atributos y variantes vacíos. No se inventa una variante para `sku_base`.
- Un padre explícitamente inactivo/borrador y un producto sin variantes elegibles devuelven 404. Las variantes explícitamente inactivas/borrador se omiten.
- El DTO comercial de G6 omite estado. La elegibilidad de filas sin estado se delega al contrato de esa proyección pública comercial; se proyectan como `ACTIVE`, que no significa stock disponible ni habilita compra. Esto no constituye una auditoría del estado interno de cada fila de Azure.

## Configuración y errores

Se reutiliza `createG6Client`, la configuración explícita de REAL (`CATALOG_SOURCE=real`, `BFF_MODE=real`) y los modos de autenticación existentes. `public-read-only` mantiene GET, política cerrada de rutas, ausencia de Authorization/Cookie y correlación. El servicio conserva el cliente por configuración efectiva igual que F011; no cambia la renovación de credenciales.

Modo MOCK conserva los fixtures. Seleccionar REAL o un modo de autenticación REAL nunca permite volver a fixtures por configuración incompleta o fallo externo. Un upstream no disponible/401/redirect se traduce a 503 saneado; timeout a 504; JSON o datos inválidos a 502; producto inexistente a 404. No se retransmiten cuerpos de error privados.

## Pruebas ejecutadas

Base Backend develop `5119e17`; Frontend develop `28f4bb0` sin cambios.

```sh
npm ci --no-audit --no-fund
npm run build
npm run typecheck
npm run test:unit
npm run test:e2e -- --runTestsByPath test/catalog-public-variants.e2e-spec.ts test/catalog-public-detail.e2e-spec.ts test/catalog-auth-compat.e2e-spec.ts
```

- Compilación y tipos PASS, después de generar Prisma mediante el build.
- Unitarias completas: **44 suites / 564 pruebas PASS**. La ejecución dirigida de mapper y comercio MOCK dio 58 PASS y queda incluida en el conjunto completo.
- HTTP dirigido: **3 suites / 27 pruebas PASS**, incluyendo ausencia de credenciales, correlación, una única lectura de detalle, configuración incoherente, 404/401/503, timeout, redirect, JSON inválido, valores aún sin hidratar, slug inválido y precio/disponibilidad sin activar.
- Azure vivo a través de Next → BFF de esta rama: **20 productos con 200 REAL**, 16 con variantes y 51 variantes totales.
- Edge: Color Blanco/Talla M → SKU `ADI-ENT26-BLA-M`; cambio a Azul/M → `ADI-ENT26-AZU-M`. Resumen de selección y consultas de precio/disponibilidad llevan el SKU correspondiente.
- Producto simple Nike Academy: variantes 200 con `hasVariants=false`, sin error ni controles de opciones.

## Evidencia de navegador y alcance pendiente

El recorrido vivo terminó el **06/11 a las 12:21:56 Lima**, antes del apagado anunciado de las 13:00. [Resultados y trazas](evidencias/H4/giuliano/2026-11-06/variants-real/variants-live.json), [llamadas upstream](evidencias/H4/giuliano/2026-11-06/variants-real/upstream.jsonl) y [checksums](evidencias/H4/giuliano/2026-11-06/variants-real/manifest.json).

- [Blanco/M seleccionado](evidencias/H4/giuliano/2026-11-06/variants-real/01-variantes-seleccion-real.png).
- [Cambio a Azul/M](evidencias/H4/giuliano/2026-11-06/variants-real/02-cambio-variante-real.png).
- [Producto simple](evidencias/H4/giuliano/2026-11-06/variants-real/03-producto-simple-real.png).

**Precio y disponibilidad siguen por confirmar:** el frontend conserva sus mensajes y los endpoints REAL G1 devuelven 503. No se activa compra ni se inventan importes o stock. La galería existente sigue mostrando la imagen de la ficha; esta PR no cambia el frontend para sincronizarla con la imagen de la variante seleccionada.

No se modificaron producción ni sus variables. No se ejecutó la suite E2E general con PostgreSQL; los HTTP indicados usan un proveedor controlado local para negativos y el ensayo vivo separado acredita el recorrido Azure. La integración completa, los gates y el despliegue requieren revisión humana.
