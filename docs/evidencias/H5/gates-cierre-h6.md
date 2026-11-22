# Gates de cierre y riesgo de release · Corte del 22/11/2026

Revisión para Diego Espinoza ([#227](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/227)). Base observada de `develop`: BE `d595caa` (1.9.0), FE `e56a13e` (1.4.0) y SPECS `ccec225`. Usar esta base para comparar el candidato del 26/11. La etiqueta de release automática y la aprobación del congelamiento son hitos distintos.

| Contribución verificable en Git | PR y commit de merge |
|---|---|
| Jim · CI/CD y deploy | [BE #267](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/267) · `ff02f03` |
| Giuliano · variantes desde G6 | [BE #277](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/277) · `c1d1450` |
| Sebastián · separación entre fixtures y REAL | [BE #279](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/279) · `9f57987` |
| Andrés · traslado de ítem a favoritos | [BE #260](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/260) · `9b2a065` |
| Leonidas · seguridad local checkout | [BE #270](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/270) · `34e3e4c` |
| Fernando · E2E de la demo H4 | [FE #129](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/129) · `61f20be` |
| Diego · listado y paso de favoritos a carrito | [BE #15](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/15) · `f29c6bd` |
| Corte H5 de Jim · seguridad, kit y direcciones | [BE #253](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/253) `b8662cd`, [BE #332](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/332) `80c6f1b`, [BE #338](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/338) `3082e10`, [BE #339](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/339) `4d24ac3`, [BE #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331) `a40429d` y [BE #333](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/333) `f11139f`. |
| Corte H5 de Jim · cuenta/direcciones, framework y SPECS | [FE #159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159) `5bd2629`, [FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158) `10a1356`, [FE #160](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/160) `685ccec`, [SPECS #18](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/18) `28b03f1` y [SPECS #19](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/19) `ccec225`. |

Los runs [CI-CD BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270842) y [validación BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270880) pasaron en `f11139f`. En FE pasaron [CI-CD FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296978) y [E2E FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296873) en `685ccec`. Incluyen smoke de Render/Vercel y artefacto GHCR en esos merges. El E2E de FE `10a1356` pasó aunque su run CI-CD quedó cancelado. SPECS #18/#19 se confirman por Git, sin checks reportados. Seguridad tiene CI de auth/Prism y reportes de DAST **MOCK** sobre revisiones identificadas. Ver [auth/Prism](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45077991907), [BE #338](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/338) y [BE #339](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/339).

| Riesgo | Decisión para el freeze |
|---|---|
| Alto · G-AUTH/G-ADDRESS siguen sin credenciales y sandbox autorizado | Mostrar cuenta y checkout como **MOCK**. Homologar alta/listado G7 REAL cuando llegue acceso. Cotización conserva su gate separado. |
| Alto · H-05 acordado sin prueba de recepción en G1 | Guardar H-05 como acuerdo y la prueba del 23/11 como pendiente. Exigir receptor desplegado, token por canal seguro y trazas entre módulos antes de declarar REAL. Seguir [#318](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/318), [#319](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/319) y [#320](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/320). |
| Alto · APIM, RabbitMQ y release dependen de evidencia del candidato | Incluir cada integración cuando haya rutas, políticas o eventos trazables. Para release, registrar SHAs, artefactos, smoke, revisión de seguridad y rollback. Si un requisito obligatorio falla, mantener la versión previa. |
| Medio · falta comparativa final de performance | Dejar [#306](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/306) abierta hasta adjuntar mediciones reproducibles y alcance/entorno. |

Congelar el alcance efectivamente demostrado, mantener responsable y retest de las brechas en H6 y enlazar la evidencia final en [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324). La revisión independiente y las firmas quedan pendientes.
