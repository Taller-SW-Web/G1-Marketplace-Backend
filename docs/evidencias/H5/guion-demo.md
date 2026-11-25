# Guion de ensayo H5 · Viernes 27/11/2026

Jim conduce y Andrés verifica. Preparar dos cuentas sintéticas, un SKU de prueba y una dirección ficticia. Anotar al iniciar FE, BE y entorno de cada tramo. Mantener credenciales fuera de pantalla y del acta.

**Calendario (Lima).** Miércoles 25/11: levantar el broker RabbitMQ de G1 y el receptor del webhook. Jueves 26/11: tener todos los componentes desplegados y probados. Viernes 27/11: corregir, ensayar, firmar y congelar el código. Sábado 28/11: presentar, con RabbitMQ de Seguridad y webhook de Ventas como parte del punto 4.

| Tiempo | Acción | Resultado visible |
|---|---|---|
| 0–1 min | Presentar candidato y distinguir CI, MOCK y REAL. | Abren las referencias del paquete [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324) y se identifican sus SHAs. |
| 1–4 min | Mostrar registro y confirmación, login con MFA y recuperación según el recorrido de Seguridad de abajo. | Estado por operación y origen visible. **REAL directo G7** acreditado al corte. Recorrido **REAL FE/BFF** pendiente de homologar. |
| 4–6 min | Mostrar alta y lista propia con A y rechazo al intentar consultar las direcciones de A con B. En V-010, seleccionar una dirección con etiqueta opcional y sin teléfono, y mostrar indisponibilidad y cotización con fixtures. | G7 directo **REAL** acreditó 201/200/403. V-010 con fixtures y cotización son **MOCK**. |
| 6–7 min | Abrir catálogo, ficha del producto y carrito con el SKU de prueba. | Se ve la línea en el carrito y se identifica el origen **MOCK** o **REAL** de los datos. |
| 7–9 min | Mostrar CI/CD, Prism **MOCK**, seguridad, performance y APIM con evidencia por tramo. | Run, SHA y entorno identificados. |
| 9–11 min | Punto 4A. Seguridad → Marketplace por RabbitMQ. | Publicación, recepción y recuperación acreditadas por traza **REAL** si la prueba se completa. |
| 11–13 min | Punto 4B. Despacho → Ventas → Marketplace por webhook. | Entrega, deduplicación y recuperación acreditadas por traza **REAL** si la prueba se completa. |
| 13–14 min | Repasar gates y contingencias. | Cada pendiente tiene responsable y próxima prueba. |

## Seguridad

| Paso | Evidencia REAL directa de G7 al corte | Recorrido del candidato y respaldo |
|---|---|---|
| Registro y confirmación | Alta 201, duplicado 409 y confirmación 204 en la mini-ronda después de un 410 inicial. Vencimiento de 24 h sin ejecutar en REAL. | Mostrar confirmación y retorno por FE/BFF como **REAL** tras prueba desplegada. Si sigue pendiente, usar V-001/V-002 **MOCK** y la traza sanitizada de G7 directo. |
| Login con MFA | Login con desafío, solicitud OTP 202 y verificación 200. Logout 204 y refresh de la sesión cerrada 401. | Mostrar desafío y acceso de la cuenta de prueba por FE/BFF tras verificarlo. Respaldo con vista **MOCK** y traza **REAL directa**. |
| Recuperación y restablecimiento | Solicitud 202 para cuenta conocida y para correo no registrado. Reset 204, reutilización 401 y expirado 410. | Mostrar solicitud, enlace y retorno por FE/BFF tras verificarlo. Usar vistas **MOCK** y trazas **REAL directas** si falta el recorrido. Mostrar las nuevas plantillas únicamente después de verificar recepción **REAL** tras el despliegue de G7. |
| Titularidad de la dirección | Alta 201, lista propia 200 y lista ajena 403 `SCOPE_INSUFICIENTE`. Control propio de B 200. | Mostrar el 403 con B por el BFF si se acredita G-ADDRESS. Si sigue pendiente, usar V-010 **MOCK** y la traza del 403 **REAL directo**. Cotización **MOCK** por separado. |

La [matriz de cierre](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/351) contiene fecha, resultados y trazas. Jim y G7 verifican el recorrido desplegado y el timeout con autorización específica. Andrés revisa G-AUTH y G-ADDRESS. La compra A/B **REAL** con Ventas depende de [BE #133](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/133).

## Punto 4 · Intercambios asíncronos

| Intercambio | Demostración prevista | Contingencia |
|---|---|---|
| A · RabbitMQ con Seguridad (G7) | G7 publica un evento de prueba en el broker de G1. El consumidor recibe de `marketplace.usuarios` con binding `usuario.*`. Correlacionar publicación y consumo por identificador de evento. Reenviar y comprobar deduplicación, mostrar reintentos y cola de descarte, y comprobar procesamiento del backlog al recuperar el consumidor. **REAL pendiente** de broker, consumidor desplegado y prueba coordinada con G7. | Si falla en vivo, mostrar traza **REAL** sanitizada de un ensayo anterior del mismo intercambio si existe. Si falta esa traza, usar un publicador de prueba **MOCK** y explicar el pendiente de G7. Si también falta la reproducción, mostrar el contrato y el paso pendiente. |
| B · Webhook con Ventas (G5) | Coordinar el envío de los siete eventos previstos por Ventas al receptor autenticado de G1. Correlacionar envío y recepción y mostrar persistencia en `shipment_event_inbox`. Comprobar deduplicación por `idEvento`, reintento tras fallo y recuperación. **REAL pendiente** de despliegue de [BE #357](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/357), migración, token y prueba con Ventas. | Si falla en vivo, mostrar traza **REAL** sanitizada de un ensayo anterior del webhook si existe. Si falta esa traza, usar emisor local **MOCK** y explicar el pendiente de Ventas. Si también falta la reproducción, mostrar el contrato H-05 y el paso pendiente. |

## Preparación y evidencia comprobada

- V-010: usar el snapshot FE `e56a13e040ba9641b600fbc937dc3863b0ecc6e7` de `develop`, que incluye el merge [FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158) `10a1356` y [FE #160](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/160) `685ccec`. Con `CHECKOUT_MODE=local-fixtures` y `NEXT_PUBLIC_CHECKOUT_MODE=local-fixtures`, abrir `/checkout/direccion`. El [check de #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45081960719) y el [E2E FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296873) prueban carrito/checkout en sus revisiones, por separado del ensayo completo.
- Cuenta: [FE #159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159) `5bd2629` incorporó V-001–V-004. Consultar [capturas y reproducción **MOCK**](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/5bd2629/docs/evidencias/H5/UX-010-cuenta-V001-V004/README.md). G-AUTH REAL permanece pendiente.
- Retest BFF: FE sin teléfono ya está alineado con [BE #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331) `a40429d`, documentado en [BE #333](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/333) `f11139f`. Repetir en modo `backend-mock` con el BE del candidato y base y sesión locales, según el [procedimiento FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/e56a13e/src/features/checkout/README.md). Por el BFF desplegado, homologar alta y listado **REAL** con control de titularidad ([#115](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/115)). Usar fixtures para la cotización **MOCK**.
- Exhibir [CI-CD BE](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/45087270842), [CI-CD FE](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45087296978) y las [pruebas Prism **MOCK**](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975254262). Los runs no sustituyen el acta de ensayo.

## Acta para registrar al terminar

Fecha/hora, asistentes, entorno, SHA FE/BE/SPECS, resultado por tramo con etiqueta MOCK o REAL, enlaces sanitizados, incidencias y retest. Andrés valida el acta de [#326](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/326). **Ensayo completo aún pendiente de registro**.
