# Guarda REAL/MOCK del origen de catálogo — 06/11/2026

## Problema reproducido

Con la configuración mixta `CATALOG_SOURCE=real` + `BFF_MODE=mock`:

- `X-Catalog-Source` respondía `REAL` (`catalogSource()` miraba `CATALOG_SOURCE`
  y `PRODUCTOS_AUTH_MODE`).
- F-012, F-014 y F-015 sólo miraban `BFF_MODE` y servían **fixtures**.
- Resultado: precios y disponibilidad de demostración publicados como datos del
  proveedor. Detalle y variantes ya fallaban cerrado porque sus adaptadores
  exigen `CATALOG_SOURCE=real` y `BFF_MODE=real`.

## Cambio

- Nuevo predicado único `isRealCatalogSource()` en `src/catalog/catalog-mode.ts`.
- Lo usan la cabecera, el detalle, variantes y los tres servicios comerciales.
- F-012 y F-014 responden 503 cuando el origen es REAL (no hay adaptador
  homologado todavía); F-015 degrada a arreglo vacío. Ninguno publica fixtures.
- Detalle y variantes no cambian de comportamiento: ya aplicaban ese predicado.

## Verificación

- `src/catalog/catalog-mode.spec.ts`: 10 casos (tabla del predicado, mixta falla
  cerrado, MOCK/MOCK sigue sirviendo fixtures).
- `npm run test:unit`: 45 suites, 574 pruebas PASS.
- `npm run typecheck`: PASS.

## Límite

La comprobación en vivo contra G6 no se repitió: la ventana de Azure cerró el
06/11 a las 13:00 Lima. La evidencia es local y de contrato; no acredita
integración desplegada.
