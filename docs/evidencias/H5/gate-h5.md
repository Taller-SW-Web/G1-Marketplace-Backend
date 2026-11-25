# Gate H5 · Corte del 24/11/2026

Revisión para Diego Espinoza ([#223](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/223)). Base de CI observada el 22/11 en `develop`: BE `d595caa` (1.9.0), FE `e56a13e` (1.4.0) y SPECS `ccec225`. Los runs corresponden a los commits de merge indicados. El candidato del congelamiento se valida por separado.

**Calendario (Lima).** Miércoles 25/11: levantar el broker RabbitMQ de G1 y el receptor del webhook. Jueves 26/11: tener todos los componentes desplegados y probados. Viernes 27/11: corregir, ensayar, firmar y congelar el código. Sábado 28/11: presentar, con RabbitMQ de Seguridad y webhook de Ventas como parte del punto 4.

| Repositorio | Incorporado a develop (merge) | CI comprobado |
|---|---|---|
| Backend | [BE #253](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/253) `b8662cd` (logout), [BE #332](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/332) `80c6f1b` (contrato Prism), [BE #338](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/338) `3082e10` (kit G7), [BE #339](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/339) `4d24ac3` (DAST), [BE #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331) `a40429d` (direcciones), [BE #333](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/333) `f11139f` (operación) | [auth-session y Prism #253](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45077991907), [auth-session y Prism #332](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975254262), [validación #338](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975206455), [validación #339](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975312610), [auth-session #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975209207) y [validación BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270880). [CI-CD BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270842): build/pruebas, versionado, Render/smoke y GHCR exitosos en `f11139f`. |
| Frontend | [FE #159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159) `5bd2629` (cuenta), [FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158) `10a1356` (dirección sin teléfono en la respuesta y etiqueta opcional), [FE #160](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/160) `685ccec` (Next.js) | E2E de carrito/checkout exitosos en [#159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087139922), [#158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087278283) y [E2E FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296873). El CI-CD independiente del merge #158 quedó cancelado. El siguiente, [CI-CD FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296978), pasó build/pruebas, versionado, GHCR y Vercel/smoke en `685ccec`. |
| SPECS | [SPECS #18](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/18) `28b03f1` (matriz) y [SPECS #19](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/19) `ccec225` (contrato/UI F-022) | Incorporación verificada en Git. Los PR no reportan checks de CI. |

| Gate | Evidencia verificable | Pendiente para cierre |
|---|---|---|
| CI/CD y seguridad | Los runs BE/FE muestran despliegue y smoke de G1 en los SHAs citados. Los checks de seguridad de BE #253/#332/#331 pasaron. DAST #339 es **MOCK** aislado y pasivo sobre los SHAs de sus reportes, con hallazgos registrados. | Andrés adjunta seguridad y smoke del candidato y registra evaluación o retest de hallazgos en [#221](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/221). |
| Pruebas, G-AUTH y G-ADDRESS | Prism #332, kit #338 en modo Prism y FE #158 con fixtures aportan evidencia **MOCK**. La ronda del 23/11 aporta evidencia **REAL directa de G7**, detallada abajo. | Jim y G7 prueban FE/BFF desplegados con trazas y coordinan la autorización específica del timeout. Andrés revisa G-AUTH y G-ADDRESS. La cotización conserva su alcance **MOCK** y requiere su propio adaptador y gate. |
| Performance | [#306](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/306) abierta sin reporte final enlazado en la issue al corte. | Fernando adjunta entorno, dataset, p50/p95/p99, RPS, errores y antes/después. |
| API Management | [#307](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/307) y [#312](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/312) abiertas sin evidencia enlazada en esas issues al corte. | Andrés y Leonidas documentan instancia/rutas y Diego adjunta las pruebas de políticas y el tráfico FE. |
| Asincronía | **REAL pendiente** en ambos intercambios. H-05 está acordado ([#318](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/318)) y Ventas tiene siete eventos previstos para la prueba. El receptor de [BE #357](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/357) tiene migración preparada. Hay un consumidor RabbitMQ en rama local, pendiente de integración. | Jim coordina con Andrés y G7 el broker propio de G1 ([#313](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/313)); Leonidas integra el consumidor y coordina migración, token y despliegue del receptor con el equipo. Diego registra recepción, duplicados, reintentos y recuperación con trazas ([#320](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/320)). |

## Seguridad REAL directa · Ronda autorizada del 23/11

**19 solicitudes del kit: 18 PASS, 1 FAIL y 4 SKIP, sin 429.** La mini-ronda usó **3/4** solicitudes autorizadas, las tres PASS y sin 429. Total reportado **28 solicitudes** (19 del kit, 6 del control manual de B y 3 de la mini-ronda). Ventana principal UTC `2026-11-23 21:53:07–21:55:48`. Los resultados y trazas están en la [matriz de cierre, BE #351](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/351).

| Issue | Resultado REAL directo de G7 | Evidencia pendiente por FE/BFF desplegados |
|---|---|---|
| BE #25 | PASS alta 201 y duplicado 409. Confirmación inicialmente FAIL con 410 `ENLACE_YA_USADO`; PASS con 204 para el enlace original en la mini-ronda. Vencimiento de verificación a 24 h: SKIP. | Vencimiento de 24 h, retorno de UI y G-AUTH. |
| BE #29 | 6/6 PASS: login 200, 401 por credenciales inválidas, 200 con desafío, solicitud OTP 202, verificación OTP 200 y logout 204. | Recorrido BFF↔G7, renovación/retorno y G-AUTH. |
| BE #33 | PASS logout 204 y refresh de la sesión cerrada 401 `REFRESCO_INVALIDO`. | Cierre por BFF, caché, idempotencia y G-AUTH. |
| BE #37 | PASS recuperación 202 para cuenta conocida y 202 para correo no registrado en la mini-ronda. | Recorrido y retorno de UI, y G-AUTH. |
| BE #41 | PASS reset 204, reutilización 401, login con clave nueva 200 y logout 204. La mini-ronda confirmó 410 `TOKEN_RECUPERACION_EXPIRADO` para un enlace sin usar de más de 30 min. | Retorno, ausencia de sesión implícita y G-AUTH. |
| BE #115 | PASS alta 201, lista propia 200 y lista ajena 403 `SCOPE_INSUFICIENTE`. Control manual de B: lista propia 200. | Alta/listado con el adaptador del BFF y revisión G-ADDRESS. Cotización **MOCK**. |

El timeout inducido fue SKIP en la ronda principal. Queda pendiente su prueba trazada con autorización específica para ambos gates. También quedan pendientes la compra A/B con Ventas ([BE #133](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/133)) y la recepción **REAL** de las plantillas de verificación y recuperación después de que Seguridad las despliegue ([BE #322](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/322)).

## Issues cerradas el 23/11

| Issue | Alcance del cierre |
|---|---|
| BE #114 | DTO, errores y titularidad con fixtures **MOCK**. [Aprobación de Andrés en BE #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331#issuecomment-7090706907). |
| BE #330 | Matriz de responsabilidades incorporada como cambio documental en SPECS `28b03f1`. [Constancia en la issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/330#issuecomment-7071627771). |
| FE #59 | Implementación de dirección con fixtures **MOCK**. [Aprobación de Andrés en FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158#issuecomment-7090730781). |
| FE #148 | Validación en línea y capturas V-010 **MOCK**. [Aprobación de Andrés en FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158#issuecomment-7090730781). |
| FE #150 | Capturas de cuenta V-001–V-004 **MOCK**. [Aprobación de Andrés en FE #159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159#issuecomment-7090735595). |

En el paquete [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324) separar CI de G1, evidencia **MOCK** e integración **REAL** por flujo. Para H6, conservar cada frontera pendiente con proveedor, dueño, siguiente prueba, revisión objetivo y criterio de aceptación.
