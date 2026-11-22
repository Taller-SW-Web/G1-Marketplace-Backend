# Guion de ensayo H5 · 26/11/2026

Jim conduce, Andrés verifica y la presentación es el 28/11. Preparar dos cuentas sintéticas, un SKU de prueba y una dirección ficticia. Anotar al iniciar FE, BE y entorno de cada tramo. Mantener credenciales fuera de pantalla y del acta.

| Tiempo | Acción | Resultado visible |
|---|---|---|
| 0–1 min | Presentar candidato y distinguir CI, MOCK y REAL. | Abren las referencias del paquete [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324) y se identifican sus SHAs. |
| 1–3 min | Recorrer cuenta V-001 a V-004 con fixtures autorizados. Abrir catálogo, producto y carrito con datos de prueba. | Se ven estados de sesión, validación y la línea del carrito. Declarar el origen de catálogo y cuenta. |
| 3–5 min | En V-010 listar, crear y seleccionar una dirección de prueba con etiqueta opcional. Verificar que la tarjeta sin teléfono sigue seleccionable. Mostrar indisponibilidad y luego cotización con fixtures. | La lista y el alta son **MOCK** en este ensayo. El error conserva el formulario. La cotización **MOCK** se presenta como tramo independiente. |
| 5–8 min | Mostrar CI/CD, Prism y seguridad. Presentar performance, APIM y webhook solo con las evidencias efectivamente obtenidas. | Run y SHA por tramo. H-05 del 23/11 se muestra como acuerdo y prueba pendiente mientras no haya traza entre módulos. |
| 8–9 min | Repasar gates y contingencia. | Cada pendiente tiene dueño y próxima prueba. Si falla un paso, mostrar evidencia identificada por fecha/SHA y anotarlo para retest. |

## Preparación y evidencia comprobada

- V-010: usar el snapshot FE `e56a13e040ba9641b600fbc937dc3863b0ecc6e7` de `develop`, que incluye el merge [FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158) `10a1356` y [FE #160](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/160) `685ccec`. Con `CHECKOUT_MODE=local-fixtures` y `NEXT_PUBLIC_CHECKOUT_MODE=local-fixtures`, abrir `/checkout/direccion`. El [check de #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45081960719) y el [E2E FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296873) prueban carrito/checkout en sus revisiones, por separado del ensayo completo.
- Cuenta: [FE #159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159) `5bd2629` incorporó V-001–V-004. Consultar [capturas y reproducción **MOCK**](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/5bd2629/docs/evidencias/H5/UX-010-cuenta-V001-V004/README.md). G-AUTH REAL permanece pendiente.
- Retest BFF: FE sin teléfono ya está alineado con [BE #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331) `a40429d`, documentado en [BE #333](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/333) `f11139f`. Repetir en modo `backend-mock` con el BE del candidato y base y sesión locales, según el [procedimiento FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/e56a13e/src/features/checkout/README.md). Cuando haya acceso G7, homologar solo alta y listado REAL ([#115](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/115)). Usar fixtures para la cotización.
- Exhibir [CI-CD BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270842), [CI-CD FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296978) y las [pruebas Prism **MOCK**](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975254262). Los runs no sustituyen el acta de ensayo.

## Acta para registrar al terminar

Fecha/hora, asistentes, entorno, SHA FE/BE/SPECS, resultado por tramo con etiqueta MOCK o REAL, enlaces sanitizados, incidencias y retest. Andrés valida el acta de [#326](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/326). **Ensayo completo aún pendiente de registro**.
