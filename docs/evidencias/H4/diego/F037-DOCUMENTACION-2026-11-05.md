# F-037 Visualizar favoritos — trazabilidad documental

Fecha: 05/11/2026. Issue: [#184](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/184). PR: [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). Responsable: Diego Espinoza. Revisor: Fernando Saire (`saire22`).

## Estado del corte

El HEAD observado antes de este incremento documental fue `19b82ade7098a31872d07846d89261c20667df97`. La implementación, persistencia y pruebas controladas de lectura están completas y sus checks CI están aprobados. La ejecución técnica que permanece pendiente es la homologación y prueba con G6 real de [#182](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/182).

Este documento deja la tarea documental lista para revisión. No declara integración G6, despliegue del SHA ni aprobación independiente.

## Fuentes y trazabilidad

| Capa | Referencia |
|---|---|
| Funcional | [F-037 Visualizar favoritos](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/funcional/F-037-visualizar-favoritos.md) |
| Contrato API | [GET `/api/v1/wishlist`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/contrato-api/F-037-visualizar-favoritos.md) |
| UI | [F-037 Favoritos](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/ui/F-037-visualizar-favoritos.md) |
| Vista | [V-009 Favoritos](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/ui/vistas/V-009-favoritos.md) |
| Servicio | [`WishlistReadService`](../../../../src/wishlist/wishlist-read.service.ts) |
| Persistencia | [`PrismaWishlistRepository`](../../../../src/wishlist/wishlist.repository.ts) y [`WishlistItem`](../../../../prisma/schema.prisma) |
| Adaptador G6 | [`RealWishlistCatalog`](../../../../src/catalog/real-wishlist-catalog.ts) |
| Pruebas | [`wishlist-read.service.spec.ts`](../../../../src/wishlist/wishlist-read.service.spec.ts), [`wishlist-handoff.integration-spec.ts`](../../../../test/wishlist-handoff.integration-spec.ts) y [`wishlist-g6.e2e-spec.ts`](../../../../test/wishlist-g6.e2e-spec.ts) |

## Contrato efectivo de lectura

`GET /api/v1/wishlist` deriva el titular de la sesión y devuelve un arreglo sin envelope, ordenado por `createdAt DESC` y desempate estable por identificador. Nunca acepta ni expone `customerId`.

| Campo | Regla |
|---|---|
| `productId` | Identificador persistido por G1 |
| `createdAt` | ISO-8601 de la intención original |
| `name`, `slug`, `brand`, `image` | Proyección vigente de G6 o `null` para retirado |
| `price` | `{ amount, currency }` vigente o `null` |
| `availability` | `AVAILABLE`, `OUT_OF_STOCK` o `UNAVAILABLE` |

La base G1 conserva únicamente titular, producto y fecha. No copia catálogo, precio, stock, marca ni imágenes de G6.

## Operación y errores

| Situación | Resultado |
|---|---|
| Lista propia con productos vigentes | `200` con proyección enriquecida |
| Sin favoritos | `200 []`; no invoca G6 |
| Producto retirado | Conserva la intención y devuelve tarjeta neutral `UNAVAILABLE`; no se elimina automáticamente |
| Producto agotado | Conserva el favorito y devuelve `OUT_OF_STOCK` |
| Sesión ausente, expirada o revocada | `401`; no expone colección previa |
| G6 caído, timeout o proyección incoherente | `503 CATALOG_UNAVAILABLE`; nunca se convierte en `[]` ni colección parcial |

La respuesta usa `Cache-Control: no-store, private`. El enriquecimiento está acotado a cuatro operaciones concurrentes, conserva el orden de base y deja de programar lotes posteriores después de un fallo.

## Diseño y decisiones aplicadas

El archivo de referencia es [Mockups](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=1-4). El handoff existente identifica para V-009 los nodos `206:3140`, `206:3224`, `206:3299`, `206:3362`, `206:3393`, `206:3483`, `206:3514`, `206:3599`, `206:3685` y `206:3761`.

La spec V-009 todavía registra su enlace Figma como pendiente, por lo que estos nodos son referencias localizadas, no aprobación visual. La revisión debe confirmar su correspondencia final.

Decisiones implementadas para las preguntas abiertas de V-009:

- `V-009-OPEN-01`: mostrar el favorito retirado como `UNAVAILABLE`, sin compra y sin borrar la intención.
- `V-009-OPEN-02`: “Deshacer” reutiliza POST F-036, revalida elegibilidad y crea una intención nueva; no recupera ID, fecha ni posición histórica.
- `V-009-OPEN-03`: agregar al carrito conserva el favorito conforme al alcance F-039 adoptado; ofrece navegación opcional al carrito sin afirmar eliminación.
- `V-009-OPEN-04`: continúa abierto porque requiere homologación de Catálogo/stock con G6.

Las tres primeras decisiones describen el comportamiento implementado y probado; su aceptación visual/funcional corresponde al revisor y no se presenta como autoaprobación.

## Evidencia disponible

- Sólo titular A/B, orden descendente estable y ausencia de `customerId`.
- Vacío confirmado sin llamadas al catálogo.
- Retirado y agotado diferenciados.
- Fallo/timeout/proyección inválida como `503`, sin colección parcial.
- PostgreSQL 16 temporal con persistencia, aislamiento y reinicio.
- Adaptador G6 ejercitado mediante servidor HTTP local controlado, incluyendo rutas fijadas y timeout; no es evidencia externa real.
- Checks del PR: build, compilación, pruebas, sesión G7 y verificación aislada aprobados para el HEAD observado.

## Pendiente técnico dependiente de G6

Para cerrar [#182](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/182) y completar la evidencia real de esta documentación se necesita:

1. URL y SHA/versiones efectivamente desplegadas de G6 y del contrato.
2. Token técnico/grant autorizado de Marketplace.
3. Productos estables para disponible, agotado y retirado/no encontrado.
4. Respuestas reales sanitizadas de detalle, disponibilidad y precio, más fallo/timeout y correlación.
5. Recorrido G1 → G6 real que confirme positivo, vacío, retirado/agotado y error sin falso vacío.

La revisión de este documento puede realizarse antes de G6; la evidencia externa se incorpora después sin reescribir el comportamiento local.
