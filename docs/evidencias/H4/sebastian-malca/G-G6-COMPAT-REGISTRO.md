# G-G6-COMPAT — Registro de fuentes y propuesta de actualización coherente

**Responsable del registro:** Sebastian Malca
**Revisores de la homologación:** Jim Segovia / G6 · Giuliano Macchiavello
**Fecha:** 2026-10-26
**Estado:** **propuesta**. No homologa, no cierra el gate y no declara F-014 REAL.

> Alcance: este documento cumple la parte asignada en
> [`plan/DECISIONES-Y-BLOQUEOS.md`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/plan/DECISIONES-Y-BLOQUEOS.md)
> («Sebastian/Leonidas registran las dos fuentes y proponen actualización coherente de
> funcional/UI/API/React y adaptador; Jim/G6 homologan la frontera»). No sustituye la
> conformidad de G6 ni la actualización de las specs de G1.

## 1. Las dos fuentes, textualmente

### Fuente A — G1 (specs vigentes)

| Documento | Corte | Regla |
|---|---|---|
| [`SPECS/contrato-api/F-014`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/contrato-api/F-014-consultar-disponibilidad-stock.md) | `main@46005a4` | «`availability` sólo admite `AVAILABLE`, `STOCK_LOW` o `OUT_OF_STOCK`. El BFF adapta `DISPONIBLE`, `STOCK_BAJO`, `AGOTADO` de Inventario» |
| [`SPECS/funcional/F-014`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/funcional/F-014-consultar-disponibilidad-stock.md) | `main@46005a4` | RN-F014-02: «proyección comercial **agregada por SKU sobre ubicaciones elegibles**» |
| [`SPECS/ui/vistas/V-007`](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/SPECS/ui/vistas/V-007-ficha-producto.md) | `main@46005a4` | Tres textos: «Disponible», «Quedan pocas unidades», «Agotado»; error con reintento |

### Fuente B — G6 (contrato candidato)

`G6-Productos-Ofertas-docs@c36bd9a`, `contratos/http/openapi.yaml` **3.1.0 / 0.6.0-rc.1**, operación `consultarDisponibilidadComercial`:

```yaml
/inventario/disponibilidad/comercial:
  get:
    x-status: provisional
    x-required-scope: inventario:disponibilidad:leer
    x-scope-registration-status: pending-security-registration
    description: >
      Proyección informativa sin cantidades ni ubicaciones internas. No reserva ni
      garantiza stock. D-INV-01 prohíbe agregar saldos entre puntos de cumplimiento
      independientes; si no existe una ruta de abastecimiento única y ejecutable,
      el estado es INDETERMINADO.
    responses:
      '200': ConsultaDisponibilidadComercialResponse

DisponibilidadComercial:
  type: object
  additionalProperties: false
  required: [sku, status]
  properties:
    sku: { type: string }
    status:
      type: string
      enum: [DISPONIBLE, STOCK_BAJO, AGOTADO, INDETERMINADO]
      description: INDETERMINADO significa que no hay abastecimiento único verificable;
        nunca equivale a AGOTADO.
```

Dos hechos relevantes que no están en la spec de G1:

1. **`INDETERMINADO` es un resultado comercial con HTTP 200**, no un error. No falta un
   campo de motivo: el contrato de G6 publica **sólo** `sku` y `status`
   (`additionalProperties: false`), así que el BFF no puede obtener ni inventar una causa.
2. **D-INV-01 prohíbe agregar** saldos entre puntos de cumplimiento independientes. La
   regla RN-F014-02 de G1 describe justamente una agregación sobre «ubicaciones elegibles»:
   el conflicto no es sólo el ancho del enum.

Observación adicional (a confirmar con G6): el mismo contrato usa **dos enums distintos**.
`DisponibilidadComercial.status` tiene cuatro valores, pero `EstadoStock` —el que usan
`/recomendaciones` y otras operaciones— tiene sólo `DISPONIBLE | STOCK_BAJO | AGOTADO`. Es decir,
una recomendación no puede expresar `INDETERMINADO` con el esquema actual. Si la homologación
adopta cuatro estados, conviene que G6 indique si `EstadoStock` también cambia o si la
recomendación queda deliberadamente en tres.

### Fuente C — registro bilateral M-01

`G6-Productos-Ofertas-docs@c36bd9a`, `integraciones/ACUERDOS_G1_MARKETPLACE_2026-10-13.md`, línea M-01:

> `ACEPTAMOS` — Mapeo G6→BFF: `DISPONIBLE`→`AVAILABLE`, `STOCK_BAJO`→`STOCK_LOW`,
> `AGOTADO`→`OUT_OF_STOCK`, `INDETERMINADO`→`UNDETERMINED`. Este último es resultado
> comercial válido y **conserva HTTP 200**; no se presenta agotamiento ni disponibilidad
> garantizada; permite reintento y distingue 503, timeout y respuesta inválida. Errores
> técnicos no se convierten en estados de inventario.
> *(Aceptación de G1; conformidad G6 pendiente. D-INV-01 es decisión interna G6 separada.)*

El mismo documento, en «Discrepancias y límites», ya identifica el pendiente: «[F-014 API]
enumera tres estados aunque M-01 acepta `UNDETERMINED`; **G1 debe actualizar su contrato
API** y G6 documentar conformidad».

**Conclusión del registro:** no hay que elegir por inferencia. G1 ya aceptó un cuarto estado
con nombre (`UNDETERMINED`), semántica y código HTTP. Lo que falta es (a) que G6 documente
conformidad y (b) que G1 actualice sus cuatro artefactos. La implementación actual de tres
estados **no contradice** M-01: es un corte anterior a la actualización de la spec.

## 2. Análisis del conflicto

| # | Conflicto | Consecuencia si no se resuelve |
|---|---|---|
| 1 | Enum G1 de 3 valores vs. 4 de G6 | Una respuesta válida de G6 (`INDETERMINADO`) se trata como **respuesta inválida** (502) |
| 2 | RN-F014-02 agrega ubicaciones; D-INV-01 lo prohíbe | Aun con 3 estados, el BFF podría publicar un estado que G6 considera no determinable |
| 3 | Error vs. estado | Un 502 por `INDETERMINADO` convierte un resultado comercial en fallo técnico y dispara reintentos inútiles |
| 4 | Sin campo de causa en G6 | Si G1 añade `availabilityReason`, inventa contrato: `additionalProperties: false` no lo publica |

## 3. Propuesta de actualización coherente

### 3.1 Contrato API (`SPECS/contrato-api/F-014`)

```diff
-`availability` sólo admite `AVAILABLE`, `STOCK_LOW` o `OUT_OF_STOCK`.
-El BFF adapta `DISPONIBLE`, `STOCK_BAJO`, `AGOTADO` de Inventario y no expone cantidades…
+`availability` admite `AVAILABLE`, `STOCK_LOW`, `OUT_OF_STOCK` o `UNDETERMINED`.
+El BFF adapta `DISPONIBLE`, `STOCK_BAJO`, `AGOTADO`, `INDETERMINADO` de Inventario y no
+expone cantidades, `locationId`, `onHand` ni `reserved`. `UNDETERMINED` significa que G6
+no pudo determinar una ruta de abastecimiento única y verificable: es un resultado
+comercial válido (HTTP 200), nunca equivale a `OUT_OF_STOCK` ni garantiza disponibilidad.
+No se publica un motivo: el contrato de origen no lo expone.
```

Se mantienen sin cambio: `productId`, `sku`, `checkedAt`, `Cache-Control: public, max-age=30`
y los códigos de error.

### 3.2 Funcional (`SPECS/funcional/F-014`)

```diff
-RN-F014-02: Para el canal público se usa una proyección comercial agregada por SKU sobre
-ubicaciones elegibles. No se exponen almacenes, onHand ni reserved.
+RN-F014-02: Para el canal público, G6 resuelve una única ruta de abastecimiento ejecutable
+por SKU. G1 no agrega saldos entre puntos de cumplimiento independientes (D-INV-01): si G6
+no puede resolver una ruta única, el estado es `UNDETERMINED`. No se exponen almacenes,
+onHand ni reserved.
```

`RN-F014-03` (no calcular umbrales con saldos internos) se mantiene: refuerza la propuesta.

### 3.3 UI (`SPECS/ui/F-014` + `V-007`)

Cuarto estado visible, con texto propio y reintento. Propuesta sujeta a UX:

| Estado | Texto | Reintento |
|---|---|---|
| `UNDETERMINED` | «No pudimos confirmar la disponibilidad» + «Volver a consultar» | Sí |

Reglas: nunca usar la palabra «Agotado»; nunca prometer disponibilidad; el mensaje no debe
sugerir un fallo del usuario.

### 3.4 React (`SPECS/componentes-react/F-014`)

- Unión `AvailabilityValue` con el cuarto valor; la región renderiza etiqueta, clase e icono.
- El adaptador valida los cuatro valores y **sigue rechazando** cualquier otro.
- CTA F-016: **decisión pendiente** (§4, D-B).

### 3.5 Adaptador / BFF (implementación)

| Archivo | Cambio |
|---|---|
| `src/catalog/product-availability.dto.ts` | Añadir `'UNDETERMINED'` a la unión y al guardia de estado |
| `src/catalog/product-availability.service.ts` | Aceptar el cuarto valor; cualquier quinto valor sigue respondiendo `502 INVENTORY_INVALID_RESPONSE` |
| `src/catalog/product-availability.fixture.ts` | Fixture con un SKU en `UNDETERMINED` (simula la respuesta ya adaptada de G6) |
| `src/features/catalog/types/product-availability.types.ts` | Cuarto valor en la unión |
| `src/features/catalog/services/product-availability.service.ts` | `isCommercialAvailability` acepta el cuarto valor |
| `src/features/catalog/components/AvailabilityRegion.tsx` | Etiqueta, clase e icono del cuarto estado |
| `src/features/catalog/components/ProductCommerce.tsx` | `toCartAvailability`: rama explícita para el cuarto estado (§3.6) |

Nota: el MOCK no tiene capa de traducción G6→BFF. El día que exista el adaptador REAL, el mapeo
`INDETERMINADO → UNDETERMINED` (M-01) vive ahí; el fixture sólo representa la respuesta ya adaptada.

Pruebas nuevas: mapeo de los cuatro estados, `UNDETERMINED` nunca `OUT_OF_STOCK`, `UNDETERMINED`
como 200 y no como error, guardia que rechaza un quinto valor, y que la UI no muestra cantidades.

### 3.6 Nota de seguridad del cambio

El `else` de `toCartAvailability` es el punto delicado. Hoy un cuarto valor ni siquiera llega
a la UI: `isValidAvailability` lo rechaza como `502 INVENTORY_INVALID_RESPONSE`. Pero si se
amplía la unión de tipos sin tocar esa función, el nuevo estado caería en el `else` y el CTA
lo presentaría como `UNAVAILABLE`. El cambio debe ser explícito y probado, no un efecto colateral.

## 4. Decisiones que necesito de la homologación

| ID | Decisión | Opciones | Propuesta |
|---|---|---|---|
| D-A | ¿Se adopta el cuarto estado? | (1) Sí, `UNDETERMINED` según M-01 · (2) No, mantener tres y tratar `INDETERMINADO` como respuesta inválida | **(1)**, porque G1 ya lo aceptó en M-01 y evita convertir un resultado comercial en error |
| D-B | CTA F-016 con `UNDETERMINED` | (1) Deshabilitado con reintento · (2) Habilitado con aviso y revalidación en checkout | **(1)** por prudencia; es decisión de UX/Giuliano, no la infiero |
| D-C | ¿Quién edita `SPECS` (API, funcional, UI, React)? | (1) Sebastian abre el PR de specs · (2) lo hace el owner de F-014/V-007 | A definir; puedo preparar el PR con el texto de §3 |
| D-D | Caché del cuarto estado | (1) 30 s igual que el resto · (2) sin caché | **(1)** por simplicidad; `INDETERMINADO` no es un error transitorio |
| D-E | ¿Se implementa antes o después de la conformidad de G6? | (1) Implementar ya y activar al homologar · (2) Esperar | **(1)** con el estado desactivado por bandera, o (2) si se prefiere no publicar contrato no homologado |

## 5. Impacto en lo ya entregado

- **PR #232 / #107 (MOCK):** implementan tres estados y **rechazan** `INDETERMINADO` con 502
  (decisión D-1 de `F012-F015-TRAZABILIDAD.md`). Es una postura defensiva correcta mientras la
  spec vigente diga tres estados; el cambio a cuatro es pequeño (§3.5) y está acotado.
- **`TASK-F014-INT-001`:** sigue bloqueada por I-01 y por este gate. No se cierra.
- **`TASK-F014-QA-002`:** el negativo «estado no homologado» ya está probado; con cuatro
  estados habría que añadir el positivo del cuarto.

## 6. Lo que este documento no afirma

- No declara F-014 REAL ni probada contra G6.
- No homologa la frontera: eso corresponde a Jim/G6.
- No fija el texto final de UI ni la conducta del CTA: son decisiones de §4.
- No modifica ninguna spec: propone el diff.
