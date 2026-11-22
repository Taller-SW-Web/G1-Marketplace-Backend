# Gates de cierre y riesgo de release · Corte del 21/11/2026

Borrador para Diego Espinoza. Alcance verificable al corte: CI/CD de backend con smoke y GHCR para `9f579877` ([run](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/42329586379)) y E2E de carrito/checkout de frontend para `30a1255a` ([run](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/42329599828)). Son referencias para comparar el candidato del 26/11. F-022 puede mostrarse como **MOCK** con [PR #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331) y debe quedar fuera del alcance REAL mientras [#115](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/115) siga pendiente.

| Contribución verificable en Git | PR y commit de merge |
|---|---|
| Jim · pipeline de CI/CD y deploy | [BE #267](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/267) · `ff02f03` |
| Giuliano · variantes desde G6 | [BE #277](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/277) · `c1d1450` |
| Sebastián · protección contra publicar fixtures como REAL | [BE #279](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/279) · `9f57987` |
| Andrés · traslado de ítem a favoritos | [BE #260](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/260) · `9b2a065` |
| Leonidas · seguridad local checkout | [BE #270](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/270) · `34e3e4c` |

Inventario parcial. Incorporar evidencia Git revisable de Fernando y Diego y los cambios H5 integrados antes del freeze. Vincular para cada aporte autor, PR, SHA, CI o caso y revisión. Un merge acredita incorporación al repositorio. La integración externa exige su propia evidencia.

| Riesgo para el candidato | Decisión para el freeze |
|---|---|
| Alto si se presenta checkout como integrado sin G7/G5/G2 | Mantener G-ADDRESS y las demás fronteras fuera del tramo REAL hasta validar sus contratos y proveedores. Mostrar F-022 como MOCK si el ensayo lo confirma. |
| Alto si se anuncia infraestructura sin traza reproducible | APIM y asincronía entran solo con evidencias [#312](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/312) y [#320](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/320), o el caso equivalente de RabbitMQ. |
| Alto si falta validación del candidato | Registrar SHAs FE/BE, runs de seguridad y smoke, configuración y procedimiento de rollback. Si falla el smoke o quedan hallazgos altos/críticos aplicables, mantener la versión anterior. |
| Medio si falta comparativa de rendimiento | Dejar [#306](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/306) pendiente con alcance y entorno autorizados. Presentar únicamente mediciones reproducibles. |

Cerrar tras revisión independiente del inventario y de la matriz de evidencia. Incorporar el resultado al paquete [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324) y anotar las fronteras diferidas a H6 con responsable y siguiente prueba.
