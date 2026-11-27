# BE #295 — Contract tests de Ventas (evidencia relacionada)

Esta evidencia corresponde a **Ventas**, no a BE #293 (Productos y Ofertas). Se registra como apoyo para el paquete H5 y no como cierre de #293 ni de #295.

| Campo | Evidencia comunicada |
|---|---|
| PR | [#344](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/344), fusionada en `develop` |
| Commit de merge | `dc66208` |
| CI | Pasó; permalink del run/check: Pendiente |
| Versiones | M1 Ventas `1.10.0`; M2 Postventa `1.6.0` |
| Contract tests | Snapshots OpenAPI offline: 6/6 aprobados |
| Provider tests | Servidor local, datos y token sintéticos; no realizan llamadas a Ventas REAL |

## Límites y pendientes de #295

La evidencia no acredita replay idempotente, detalle `PAGADO` ni CSAT. El issue #295 sigue abierto hasta que esos escenarios tengan evidencia atribuible. Adjuntar enlaces al workflow/check de CI, reportes y resultados sanitizados cuando estén disponibles.
