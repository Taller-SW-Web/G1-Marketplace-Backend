# Catálogo H4 — F-006 a F-010

Implementación de Giuliano en `feat/giuliano-hito4`, 26/10/2026. Revisión independiente e integración/despliegue pendientes.

## API pública de Marketplace

- `GET /api/v1/catalog/home`: categorías activas y destacados. Conserva su DTO; destacados siguen vacíos hasta decisión de curaduría G-FEATURED.
- `GET /api/v1/catalog/filters`: contrato aditivo G1 implementado para F-008; no requiere sesión del comprador ni acepta parámetros. Devuelve `{ categories: [{categoryId,name}], brands: [{brandId,name}] }`, con maestros activos proyectados desde `/api/v1/categorias` y `/api/v1/marcas` de G6. Un fallo de maestros devuelve 503; no afecta a home ni se presenta como lista vacía. Falta revisión/homologación del contrato G1.
- `GET /api/v1/catalog/products`: `q`, `categoryIds`, `brandIds`, `minPrice`, `maxPrice`, `sort`, `page`, `pageSize`. El contrato G6 publicado admite **una categoría y una marca** combinadas con AND; las claves G1 históricas mantienen su nombre plural pero rechazan CSV, repetidos y valores vacíos. Multiselección queda pendiente de contrato, sin filtrar una página incompleta en G1.

Mapeo: `categoryIds→categoriaId`, `brandIds→marcaId`, `minPrice→precioMin`, `maxPrice→precioMax`, `page→pagina+1`, `pageSize→tamanio`, `NAME_ASC/DESC→NOMBRE_ASC/DESC`; siempre `canal=MARKETPLACE`. Los importes son PEN no negativos con hasta dos decimales; rango inválido devuelve `400 INVALID_PRICE_RANGE`. Página entera cero basada, tamaño inicial 24/máximo 48. Otros criterios no publicados se rechazan. No se añaden precios inventados a tarjetas: los importes privados de fixtures sirven exclusivamente para probar filtros MOCK.

El proveedor valida coherencia de total/tamaño/página y rechaza productos repetidos o páginas incompletas inconsistentes. Un número de página válido fuera del total devuelve una colección vacía controlada; la UI ofrece volver a la primera conservando criterios, sin bucle de reintentos. Esta política implementada queda sujeta a revisión de V-006-OPEN-03.

Todas las rutas mantienen `Cache-Control: no-store`, `X-Catalog-Source` y `X-Request-Id`. El token técnico queda sólo en servidor. Un `422 CATEGORIA_INVALIDA/MARCA_INVALIDA` G6 se traduce a `400 INVALID_FILTER`; los demás fallos/timeout conservan un error seguro. No se sustituye una dependencia fallida por MOCK.

## Fuente externa y límites

Se contrastó el OpenAPI G6 publicado `0.6.0-rc.1`, blob `f64bfe9a097b2a0f74c2600988305443d92f640e`, que ya es el pin del adaptador. Publica parámetros marca/precio y ambas rutas de maestros. Esto permite construir el adaptador, pero no certifica grants, datos, runtime, homologación bilateral ni despliegue. `demo-no-auth` histórico no cierra identidad técnica G7.

Pruebas relevantes: `npm run test:unit -- --testPathPatterns=catalog`, `npm run test:g6:contract`, `npm run test:e2e -- --testPathPatterns=catalog.e2e`, `npm run typecheck` y `npm run build` (regenerar Prisma antes del typecheck si cambia el esquema integrado). Las pruebas de contrato de este corte usan proveedores locales/sintéticos.

Se usó Codex para implementación y pruebas; el código debe recibir revisión humana de Sebastian/Leonidas. Ninguna aprobación ni cierre de INT se atribuye a estas pruebas locales.

## Verificación final de seguridad y CI

El 26/10/2026 pasaron los controles existentes de Gitleaks 8.30.1 y Semgrep 1.181.0: detectores con controles positivos, fuente/historial/artefacto, cuatro reglas SAST y auditoría runtime/dev sin vulnerabilidades. Informes locales en `.local-security`. Las 169 pruebas unitarias completas pasaron. El contrato de catálogo se genera con `node scripts/openapi-catalog-h4.mjs` en `docs/contratos/openapi-catalogo-h4.json`. El workflow H4 valida esta rama al hacer push; no despliega. Su resultado remoto y el CD del corte aprobado deben verificarse aparte. [Evidencia SPECS](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/feat/giuliano-hito4/plan/evidencias/H4-GIULIANO-2026-10-26.md).
