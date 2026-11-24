# H5 Performance — preparación y reporte

Issues asignadas: [#300 entorno y stubs](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/300), [#301 perfiles de catálogo](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/301), [#302 soak autenticado](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/302) y [#306 comparación antes/después](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/306).

## Estado

Los scripts y este formato de reporte están preparados en el repositorio. **No se ha ejecutado k6**: no hay URL de staging G1, dataset confirmado ni corrida registrada en esta evidencia. No se atribuyen métricas, gráficos, despliegues ni resultados.

El alcance de carga es G1 propio. Las llamadas a Ventas u otros grupos deben quedar sustituidas por stubs del entorno G1; el adapter `sales.mock` ya existe. Despacho entra a G1 mediante el webhook H-05, no como llamada saliente: las pruebas pueden usar eventos sintéticos contra el receptor local, nunca publicar carga en Ventas. Los scripts rechazan un host remoto que no esté expresamente incluido en `G1_STAGING_HOSTS` y requieren la confirmación `LOAD_TEST_ACK=g1-owned-staging-with-stubs`. No apuntar estas corridas a G6/G5 ni a producción.

## Artefactos

- `perf/k6/catalog-pages.js`: perfiles `warmup`, `load`, `stress` y `spike` para home, búsqueda y detalle de producto.
- `perf/k6/commerce-soak.js`: soak autenticado corto de carrito, favoritos y replay idempotente de pedido. Requiere casos de checkout sintéticos, ya preparados y aislados por VU.
- Ambos aplican los umbrales de referencia de #301/#302: p95 menor de 800 ms y tasa de error menor de 1 %. Un fallo de umbral hace que k6 finalice con error.

## Preparación requerida para #300

1. Desplegar un staging propio G1 identificando los SHAs de Frontend y Backend. Usar base de datos exclusiva de pruebas y confirmar que el despliegue usa stubs para dependencias externas; el Backend ya incluye el adapter `sales.mock` activado mediante `USE_MOCKS`.
2. Para el catálogo MOCK incluido en Backend, el dataset determinista ya tiene `QA_SEARCH_QUERY=Zapatillas` y `QA_PRODUCT_SLUG=producto-demostracion-1` (`src/catalog/fixtures.ts`). No usar los productos QA de G6 en una corrida con stubs.
3. Crear además un dataset sintético con dos operaciones de checkout en estado `PREPARED`, cada una con usuario/caso e `Idempotency-Key` exclusivos. Usar datos de contacto sintéticos; no guardar JWT, correo real ni PII en este directorio.
4. Definir `G1_API_URL`, `G1_STAGING_HOSTS`, `G1_UPSTREAMS_STUBBED=true`, `LOAD_TEST_ACK=g1-owned-staging-with-stubs`, `QA_SEARCH_QUERY` y `QA_PRODUCT_SLUG`. Para `commerce-soak.js`, añadir `G1_TEST_ACCESS_TOKEN` y `CHECKOUT_CASES_JSON` en el entorno seguro del runner; nunca en el comando, este repo o un artefacto.
5. Confirmar desde logs/configuración que el BFF solo llama stubs G1 y ejecutar `PROFILE=warmup` antes de medir. No mezclar arranque en frío con las corridas comparables.

Forma del JSON que se entrega por el entorno seguro a `CHECKOUT_CASES_JSON` (los IDs se obtienen de operaciones PREPARED reales del staging desechable; los datos personales son sintéticos):

```json
[
  {
    "checkoutOperationId": "UUID-de-operacion-preparada-para-VU-1",
    "idempotencyKey": "UUID-v4-exclusivo-del-caso-1",
    "contact": {
      "fullName": "QA Load User 1",
      "documentType": "DNI",
      "documentNumber": "00000001",
      "phone": "+51999999991",
      "email": "qa-load-1@example.invalid"
    }
  },
  {
    "checkoutOperationId": "UUID-de-operacion-preparada-para-VU-2",
    "idempotencyKey": "UUID-v4-exclusivo-del-caso-2",
    "contact": {
      "fullName": "QA Load User 2",
      "documentType": "DNI",
      "documentNumber": "00000002",
      "phone": "+51999999992",
      "email": "qa-load-2@example.invalid"
    }
  }
]
```

Los textos `UUID-...` de arriba son marcadores, no valores válidos para ejecutar. El token debe corresponder al dueño de las dos operaciones preparadas.

## Comandos

Con k6 instalado, ejecutar desde la raíz del Backend. Inyectar las variables de forma segura; los valores indicados son nombres de configuración, no credenciales:

```powershell
$env:PROFILE = 'warmup'
k6 run perf/k6/catalog-pages.js --summary-export perf-h5-warmup.json
$env:PROFILE = 'load'
k6 run perf/k6/catalog-pages.js --summary-export perf-h5-catalog-load.json
$env:PROFILE = 'stress'
k6 run perf/k6/catalog-pages.js --summary-export perf-h5-catalog-stress.json
$env:PROFILE = 'spike'
k6 run perf/k6/catalog-pages.js --summary-export perf-h5-catalog-spike.json
k6 run perf/k6/commerce-soak.js --summary-export perf-h5-commerce-soak.json
```

La corrida autenticada requiere un token G7 de usuario de QA y operaciones ya preparadas en el staging G1. Cada repetición usa el mismo cuerpo y clave idempotente del caso asignado. No ejecutar contra pedidos, cuentas o datos reales.

## Reporte comparativo #306

Una corrida “antes” y otra “después” solo son comparables si conservan perfil, datos, configuración, duración, entorno y calentamiento. Registrar el SHA base y el candidato; guardar los JSON originales del runner en almacenamiento de equipo aprobado y enlazarlos aquí cuando estén sanitizados.

| Escenario | Antes: SHA / run | Después: SHA / run | p50 | p95 | p99 | RPS | errores (%) | Conclusión |
|---|---|---|---:|---:|---:|---:|---:|---|
| Catálogo — load | Pendiente | Pendiente | — | — | — | — | — | Pendiente de corrida |
| Catálogo — stress | Pendiente | Pendiente | — | — | — | — | — | Pendiente de corrida |
| Catálogo — spike | Pendiente | Pendiente | — | — | — | — | — | Pendiente de corrida |
| Carrito/favoritos/pedido — soak | Pendiente | Pendiente | — | — | — | — | — | Pendiente de corrida |

### Registro del entorno

- Fecha/hora y zona: pendiente.
- URLs propias G1 y SHAs/digests desplegados: pendiente.
- Versión de k6, perfil, VUs, duración y thresholds: pendiente de registrar por run.
- Dataset sintético/versionado y modo de stubs: pendiente de confirmar.
- Logs/trazas/correlation IDs y enlaces a artefactos: pendiente.
- Revisión de Jim y, si participó en el artefacto, segunda revisión independiente: pendiente.
