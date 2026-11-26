# F-015 — Registro de fuente y permiso de recomendaciones

**Responsable:** Sebastian Malca
**Revisores:** Giuliano Macchiavello · Jim Segovia / G6 · Leonidas Garcia (scope/API)
**Fecha:** 2026-10-26
**Estado:** **registro y propuesta**. No homologa, no cierra el gate de F-015 y no declara la región REAL.

> Cubre el pendiente «fuente y permiso de recomendaciones en G6» que bloquea
> `TASK-F015-INT-001`. El contrato de G1 ya decía que la integración externa estaba
> pendiente, «incluido request exacto, auth y consulta batch de catálogo». Aquí queda
> registrado qué ofrece hoy el contrato de G6 y qué falta decidir.

## 1. Fuente disponible en G6

`G6-Productos-Ofertas-docs@c36bd9a`, `contratos/http/openapi.yaml` **3.1.0 / 0.6.0-rc.1**:

```yaml
/recomendaciones:
  get:
    operationId: obtenerRecomendaciones
    summary: Obtener candidatos de cross-sell/upsell
    x-status: provisional
    x-required-scope: recomendaciones:leer
    x-scope-registration-status: pending-security-registration
    parameters: [productoId (required), canal (required), CorrelationId]
    responses:
      '200': RecomendacionesResponse

Recomendacion:
  required: [product_id, type, rule_priority, presentation_order, availability]
  properties:
    product_id: string
    type: [CROSS_SELL, UPSELL]
    rule_priority: integer >= 0
    presentation_order: integer >= 1
    current_price: number | null   # sin moneda
    availability: EstadoStock       # DISPONIBLE | STOCK_BAJO | AGOTADO
```

## 2. Permiso: el bloqueo concreto

El bloque `x-security-contract` del mismo contrato registra el scope así:

```yaml
recomendaciones:leer:
  clients:
  - modulo-chatbot
```

**`modulo-marketplace` no figura como client autorizado** para `recomendaciones:leer`, y el
scope está marcado `pending-security-registration`. No es un detalle de documentación: con el
contrato actual, el BFF de Marketplace no tendría permiso para consumir la operación. Ése es el
«permiso» que faltaba nombrar en el gate.

## 3. Mapeo campo a campo y diferencias reales

| G6 | G1 (contrato publicado) | Situación |
|---|---|---|
| `product_id` | `productId` | directo |
| `type` (`CROSS_SELL`/`UPSELL`) | `type` | mismo enum |
| `presentation_order` | `presentationOrder` | directo; G1 respeta ese orden |
| `rule_priority` | — | G1 no lo expone; es prioridad interna de la regla |
| `current_price` (number, `>= 0`, sin moneda) | `price: { amount, currency } \| null` | **requiere moneda de otra fuente**; además G6 admite `0` y G1 rechaza `<= 0` |
| `availability` (`EstadoStock`, obligatorio) | — | G1 lo **excluye** a propósito |
| — (no envía nombre/slug/imagen) | `name`, `slug`, `image` | el BFF enriquece desde Catálogo |
| — | máximo 8, deduplicado, sin producto origen | regla de G1, no de G6 |

### Conflictos que hay que decidir (no son errores del MOCK)

1. **Moneda ausente.** `current_price` es un número sin moneda. El contrato de G1 exige
   `{ amount, currency }` con ISO-4217. Hay que definir de dónde sale la moneda (¿Pricing por
   SKU, canal, configuración?) o cambiar el contrato de G1.
2. **`current_price: 0`.** G6 lo permite (`minimum: 0`); G1 lo rechaza como importe inválido.
   ¿Un `0` significa «sin precio» (→ `null`) o es dato corrupto?
3. **`availability` por recomendación.** G6 la publica; G1 la excluye para no tener una segunda
   fuente de disponibilidad junto a F-014. El adaptador REAL debería **descartarla** antes de
   validar el DTO público. Si además se quisiera filtrar tarjetas agotadas, sería una regla de
   negocio nueva, no una decisión técnica.
4. **Estado no representable.** `EstadoStock` de G6 tiene tres valores; `DisponibilidadComercial`
   tiene cuatro. Una recomendación no puede expresar `INDETERMINADO` (ver `G-G6-COMPAT-REGISTRO.md`).
5. **Permiso.** Registrar `modulo-marketplace` en `recomendaciones:leer` y salir de
   `pending-security-registration`.

## 4. Propuesta

| # | Propuesta |
|---|---|
| P-1 | Mantener `availability` fuera del contrato público de F-015: F-014 es la única fuente en la ficha. El adaptador G6→BFF la descarta explícitamente y se documenta que no se ignora por accidente. |
| P-2 | Mapear `current_price: 0` y `null` a `price: null` (sin importe), nunca a `S/ 0.00`. Es coherente con RC-F-015-03. |
| P-3 | Obtener la moneda del mismo origen que F-012 (Pricing por SKU) para no duplicar reglas; si no hay precio resoluble, `price: null`. |
| P-4 | Ordenar por `presentation_order` (ya implementado) y no exponer `rule_priority`. |
| P-5 | Solicitar a G6 el registro de `modulo-marketplace` en `recomendaciones:leer` antes de cualquier prueba REAL. |

## 5. Decisiones que necesito

| ID | Decisión | A quién |
|---|---|---|
| D-F | Moneda de `current_price`: ¿Pricing por SKU, canal, o cambio de contrato G1? | Giuliano / Leonidas |
| D-G | `current_price: 0` → `null` o error de dato | Giuliano |
| D-H | ¿Se descarta `availability` (propuesta P-1) o se usa para filtrar tarjetas agotadas? | Giuliano / UX |
| D-I | Registro del scope `recomendaciones:leer` para `modulo-marketplace` | Jim / G6 |
| D-J | Etiquetado visible Cross-sell/Upsell: el contrato no trae etiqueta y UX no lo ha definido; hoy no se muestra | UX / Giuliano |

## 6. Lo que este registro no afirma

- No hay prueba REAL de F-015: depende de I-01 y de D-I.
- No se modifica el contrato de G1 ni el de G6.
- El MOCK de `PR #232` sigue siendo una demostración de forma, no de integración.
