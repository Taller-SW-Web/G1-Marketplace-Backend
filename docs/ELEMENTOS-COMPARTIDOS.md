# Elementos compartidos del catálogo NestJS

Versión documental 0.2.1 · 16/10/2026 · En revisión. Giuliano desarrolla el bloque; Sebastian y Leonidas revisan. Estas utilidades se comparten dentro de catálogo, sin atribuirles ownership de auth, checkout o inventario.

## Módulo y contratos

| Export / archivo | Contrato | Consumo y límite |
|---|---|---|
| [CatalogModule](../src/catalog/catalog.module.ts) | Registra controller/service, provider por token e interceptor/filtro | Importado por AppModule; depende del ConfigService global del baseline |
| [CatalogService](../src/catalog/catalog.service.ts) | home/search con URLSearchParams y requestId; getter source | Valida antes del proveedor; exportado por el módulo para composición dentro del catálogo |
| [CatalogController](../src/catalog/catalog.controller.ts) | GET home/products bajo api/v1/catalog; 405 para escrituras | Rutas y DTO H3 conservados; no inicia otro servidor |
| [types.ts](../src/catalog/types.ts) | Category, ProductCardDTO, HomeDTO, CatalogPageDTO, CatalogQuery, CatalogProvider, CatalogEnvironment, CatalogFetch | Tipos internos compatibles con la proyección pública existente; no exponen precio/stock inventados |
| Mismo archivo: CATALOG_PROVIDER | Symbol usado como token de inyección | Una implementación elegida por ConfigService; sustituible en pruebas con overrideProvider |
| [provider.ts](../src/catalog/provider.ts) | createProvider, createRealProvider, projectProduct; versión/SHA fijados | MOCK explícito fuera de producción o REAL autorizado; sin fallback entre ambos |
| [query.ts](../src/catalog/query.ts) | parseQuery(URLSearchParams): CatalogQuery | Normalización, límites, claves desconocidas/duplicadas y categoría singular |
| [errors.ts](../src/catalog/errors.ts) | CatalogError(code?,status?,diagnostic?), problem(error,requestId) | Error interno y proyección segura; el diagnóstico no se serializa al visitante |
| [CatalogRequestInterceptor](../src/catalog/catalog-request.interceptor.ts) | Contexto HTTP local al controller | UUID, cabeceras públicas, log con hash y saneamiento de excepciones inesperadas |
| [CatalogExceptionFilter](../src/catalog/catalog-exception.filter.ts) | CatalogError → problem+json | Filtro del controller; no reemplaza el NotFoundFilter global ni los errores de otros módulos |

## Consumir y probar

```typescript
import { parseQuery } from '../src/catalog/query';
import { createRealProvider } from '../src/catalog/provider';
import { CATALOG_PROVIDER } from '../src/catalog/types';
import type { CatalogProvider } from '../src/catalog/types';

const query = parseQuery(new URLSearchParams('q=running&page=0&pageSize=24'));
// En TestingModule, sustituir el proveedor sin iniciar otro servidor ni cambiar AppModule:
// .overrideProvider(CATALOG_PROVIDER).useValue(testProvider satisfies CatalogProvider)
```

CatalogProvider declara source y métodos home(requestId?) / search(query,requestId?) asíncronos. El controller genera requestId mediante el interceptor y lo propaga al servicio/proveedor. El adaptador real acepta fetchImpl: CatalogFetch para respuestas sintéticas; esa inyección no acredita runtime con G6.

parseQuery recibe la URL original para detectar duplicados, incluidos los que se perderían al proyectar directamente a un DTO de query. No se modifica el ValidationPipe global. PageSize es 1–48, page comienza en cero y mantiene el límite técnico local de 1 000 000; q usa 2–120 caracteres y espacios normalizados. Sólo un categoryId y orden NAME_ASC/DESC; no implementa filtros múltiples.

Las configuraciones de PostgreSQL, CORS_ORIGINS y PORT pertenecen al baseline AppModule/main. HealthModule y PrismaService conservan sus contratos/ciclo de vida. No importar Backend, Prisma ni secretos en React; la web sólo consume el BFF y sus DTO. No reaparecen createApp ni server.js como capa alternativa.

CORS sigue la configuración compartida: sin cabecera de concesión para orígenes ajenos, sin convertir esa política en autenticación. El frontend consulta mediante su proxy Next. El filtro global 404 mantiene el formato del baseline; los errores del catálogo conservan su formato problem+json.

## Compatibilidad y verificaciones

La migración cambia imports internos de require/createApp a módulos TypeScript e inyección NestJS. Los consumidores HTTP mantienen rutas, DTO, cabeceras y códigos de validación/proveedor. La guía anterior 0.1.0 describe el handler retirado; no debe usarse para nuevos consumidores.

Pruebas: [catalog.spec.ts](../src/catalog/catalog.spec.ts) cubre 38 casos de dominio/proveedor; el baseline agrega sus 2 casos unitarios de HealthService. [catalog.e2e-spec.ts](../test/catalog.e2e-spec.ts) prueba 13 casos HTTP del AppModule compuesto y el baseline conserva 6 casos HTTP de health. El total del corte de imagen opcional es 40 unitarios y 19 HTTP. Consultar [CATALOGO-S1.md](CATALOGO-S1.md) para comandos, configuración y límites.

Para extender fuera del catálogo, acordar semántica/ownership con el dueño y Leonidas antes de extraer una biblioteca común. Esta entrega no completa O-010 ni implementa autorización del visitante, Pricing o Inventario. Se trabaja y publica únicamente en la rama individual; revisión humana y PR manual pendientes.

## Imagen de producto opcional — 16/10/2026

`ProductCardDTO.image` es `{ url: string; alt: string } | null`. El adaptador de G6 acepta `images` omitido o `[]` y devuelve `image: null`, sin retirar el producto ni alterar total/paginación. El Frontend decide la presentación mediante su placeholder local; el Backend no inventa una URL de imagen del proveedor.

Las imágenes presentes siguen requiriendo array válido, primera URL no vacía, HTTPS, ausencia de credenciales y hostname permitido. `images: null`, tipos incorrectos, URLs inseguras y productos inválidos siguen dando error; `image: null` es la representación pública de ausencia, no un permiso para omitir validaciones. Los consumidores directos del DTO deben manejar null; imagen nula se cubre en Frontend y se mantiene el handoff por slug/returnTo a Sebastian.
