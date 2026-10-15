# Utilidades compartidas del BFF de catálogo

Versión documental 0.1.0 · 14/10/2026 · En revisión. Autor del bloque: Giuliano; revisión técnica: Leonidas y revisión principal: Sebastian. Estas utilidades se comparten **entre lecturas de catálogo**; no son todavía una librería transversal de todos los módulos.

| Archivo / export | Contrato | Límite |
|---|---|---|
| [`errors.js`](../src/catalog/errors.js): `CatalogError` | `(code?, status?, diagnostic?)`; defaults `CATALOG_UNAVAILABLE`, 503 | No importar como error de auth/checkout sin definir antes ese contrato |
| Mismo archivo: `problem` | `(error, requestId)` → `{type,title,status,code,requestId}` | Mensajes públicos; el diagnóstico interno no se serializa |
| [`query.js`](../src/catalog/query.js): `parseQuery` | `URLSearchParams` → consulta normalizada | Valida antes de llamar al proveedor; no aplica reglas administrativas |
| [`provider.js`](../src/catalog/provider.js): `createProvider` | `(env?, fetchImpl?)` → proveedor de home/search | Mock explícito y prohibido en producción; real exige configuración y aprobación registradas |
| Mismo archivo: `createRealProvider`, `projectProduct` | Adaptador HTTP y proyección pública de tarjeta | No replica BD, inventa SKU, calcula precios ni autoriza stock |
| [`app.js`](../src/app.js): `createApp` | `{env?,provider?,healthCheck?,log?}` → handler HTTP | CORS explícito, UUID, log seguro y composición de rutas |
| [`server.js`](../src/server.js) | Arranque del proceso | No importarlo desde tests/clientes: abre el puerto y registra señales |

## Validación compartida

```js
const { parseQuery } = require('./src/catalog/query');
const query = parseQuery(new URLSearchParams('q=running&page=0&pageSize=24'));
```

Se admiten q, page, pageSize, categoryIds y sort. q vacío elimina búsqueda; si tiene texto se normaliza y requiere 2–120 caracteres. PageSize es 1–48 y page es entero desde cero; la implementación añade un límite técnico de 1 000 000 para page, pendiente de revisión como guardia local. Parámetros desconocidos/duplicados se rechazan.

CategoryIds sólo permite un ID en este corte, mapeado a `categoriaId` singular de G6. No representa F-008 completo. Sort sólo admite NAME_ASC/DESC, mapeado a NOMBRE_ASC/DESC; no ordenar localmente una página incompleta.

## Contrato común de errores

400 identifica entradas inválidas mediante INVALID_SEARCH_QUERY, INVALID_PAGE, INVALID_SORT, INVALID_FILTER o INVALID_PARAMETERS. CATALOG_UNAVAILABLE usa 503 para falta de configuración o fallos del proveedor. Un 401/403 técnico de G6 no significa sesión vencida del visitante.

`createApp` genera el requestId, recibe el resultado del proveedor y registra sólo datos permitidos. La consulta se registra como hash; no se registran token, payload externo, búsqueda cruda ni detalles de base de datos. `problem` usa mensajes públicos reconocidos. No pasar `error.message` de un tercero directamente al navegador.

## Inyección para pruebas y separación

```js
const http = require('node:http');
const { createApp } = require('./src/app');

const app = createApp({
  env: { CATALOG_SOURCE: 'mock', CORS_ORIGIN: 'http://localhost:3000' },
  healthCheck: async () => {}, // Sólo prueba; no acredita una BD real.
  log: () => {},
});
const server = http.createServer(app);
// El test decide cuándo abrir/cerrar el servidor.
```

El adaptador acepta fetchImpl para pruebas deterministas; un stub no acredita integración real. Los métodos home/search reciben el requestId para propagar X-Correlation-Id. La configuración real exige versión y SHA revisados y host de medios permitido; parámetros secretos permanecen en variables de entorno.

El frontend sólo consume DTO públicos. No importar código Backend, Prisma ni configuración del proveedor desde React. El healthCheck de producción continúa comprobando BD real y puede fallar aunque las lecturas de catálogo funcionen.

## Revisión y evolución

Pruebas existentes: 34 casos en [`catalog.test.js`](../test/catalog.test.js), con respuestas sintéticas y HTTP local propio, incluyendo timeout efectivo. Consultar [ejecución/configuración](CATALOGO-S1.md) para comandos y gates.

Para reutilizar una utilidad fuera de catálogo, acordar semántica/ownership con el dueño del bloque y Leonidas antes de extraerla a un módulo común. Versionar el contrato, revisar consumidores y actualizar pruebas/documentación. Los helpers actuales no sustituyen los contratos de Seguridad, Ventas o Despacho.

Política actualizada de esta sesión: crear commits y subir la rama de trabajo al remoto, sin publicar a main ni abrir PR. Giuliano preparará los PR manualmente al terminar. El inventario y changelog centrales están en `G1-Marketplace-SPECS/SPECS/ui/sistema-diseno/`.
