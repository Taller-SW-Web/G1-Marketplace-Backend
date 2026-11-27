# Guion de ensayo H5 · Viernes 27/11/2026

Jim conduce y Andrés verifica. Estado al jueves 26/11/2026 a las 19:30 (Lima). Al iniciar se anotan los SHA de FE, BE y SPECS del candidato y el entorno de cada tramo. Las credenciales quedan fuera de pantalla y del acta. Cada resultado se etiqueta **REAL**, **MOCK** o **LAB**.

## Datos de prueba

| Dato | Valor |
|---|---|
| Cuentas de G7 | Cuenta A (cliente sin MFA, dueña del pedido real) y cuenta B (con MFA por correo); las contraseñas no se muestran |
| Pedido real | `PED-2026-00092`, `PROD-101` / `SKU-AUR-01`, 139,90 PEN (129,90 + envío 10,00), tarjeta de crédito, entrega a domicilio |
| Pedido de muestra para correo | `PED-2026-90001` (solo C-002 de QA) |
| Frontend desplegado | `https://g1-marketplace-frontend.vercel.app` |
| BFF desplegado | `https://g1-marketplace-backend.onrender.com` (el servicio gratuito tarda en despertar: abrir `/health` unos minutos antes) |
| Ventas | `https://g5-api-gateway.onrender.com` (también duerme: llamar a su `/actuator/health` antes) |

No se crea una compra nueva durante el ensayo: el fixture de homologación venció el 26/11 a las 17:30 y un segundo pedido real no está acordado con Ventas.

## Recorrido (14 minutos)

| Tiempo | Acción | Resultado visible |
|---|---|---|
| 0–1 min | Presentar el candidato y distinguir CI, MOCK, REAL y LAB. | Se abren las referencias del paquete [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324) y los SHA. |
| 1–4 min | **Punto 1.** Pipeline unificado, gates que rompen el build, SAST/SCA/secretos, DAST, SBOM y rollback ensayado. | Runs y reportes por SHA; hallazgo → corrección → retest. |
| 4–6 min | **Punto 2.** Matriz módulo × operación × caso: G7 (login, MFA, direcciones por el BFF, 19 de 19), Ventas (compra real) y Despacho (webhook). | Informes REAL en `docs/evidencias/H5/integracion-real/` y requestId. |
| 6–8 min | Demo en vivo: catálogo (inicio y filtros REAL), ficha, carrito, login de la cuenta A y **Mis pedidos** con `PED-2026-00092` en su estado actual (`PAGADO` o el que haya llegado). | Se ve el pedido real de la cuenta A; el checkout se muestra con la etiqueta MOCK de cotización. |
| 8–10 min | **Punto 3.** Reporte k6: carga, estrés con quiebre a 800 VUs, recuperación, spike, soak y antes/después de la caché. | Gráficos p50/p95/p99, errores y recursos; declarar **LAB**. |
| 10–12 min | **Punto 4A.** Seguridad → Marketplace por RabbitMQ. | `usuario.creado` real de G7 recibido y registrado en 3 s; hallazgo de la fecha (seis eventos descartados), corrección #409 y recuperación manual; laboratorio de duplicados y reconexión. |
| 12–13 min | **Punto 4B.** Despacho → Ventas → Marketplace por webhook. | 7 eventos reales, 401 con token incorrecto, duplicado detectado, correo C-002 único; reintento tras un 503 controlado si la ventana de #320 se ejecutó. |
| 13–14 min | Repasar los límites y qué quedó pendiente, con responsable. | Cada pendiente indica quién y cuándo. |

## Seguridad (apoyo del punto 2)

| Paso | Evidencia REAL | Límite |
|---|---|---|
| Login y sesión | Ronda del 26/11 por el BFF: login sin MFA, contraseña incorrecta 401, sesión, logout y refresh rechazado, Origin ajeno rechazado antes de llamar a G7 (BE #405). | La rama con MFA y el registro nuevo se omitieron; van en la ronda 3. |
| Titularidad de la dirección | Alta 201, lista propia 200, titular ajeno 400 y sin sesión 401 por el BFF; lista ajena 403 en la ronda directa a G7 del 23/11. | El 403 con el token de otro usuario por el BFF depende de la prueba con la cuenta B. |
| Origen no autorizado | Un login desde `http://127.0.0.1:3101` devolvió 403 `FORBIDDEN` del BFF (18:12:10, FE #138). | Es una protección por diseño. |

## Punto 4 · Intercambios asíncronos

| Intercambio | Qué se demuestra | Etiqueta |
|---|---|---|
| A · RabbitMQ con Seguridad (G7) | Entrega automática de `usuario.creado` con el consumidor corregido; seis descartes reales por la validación de fecha y su recuperación manual; duplicados, backoff, DLQ y reconexión. | REAL (entrega y recuperación) y LAB (resiliencia). La reacción a bloqueo y purga (#316) solo se muestra si se ejecutó. |
| B · Webhook con Ventas (G5) | 7 eventos reales persistidos, `X-Webhook-Token`, deduplicación y correo C-002 único. | REAL. El `DESPACHADO` y `ENTREGADO` del pedido real y el reintento ante 503 (#320) se muestran solo si llegaron. |

## Contingencias

- Si el BFF o Ventas están dormidos, mostrar primero la evidencia grabada del informe y volver a intentar en vivo.
- Si el listado del catálogo sigue en 503 (host de imágenes de G6), mostrar inicio y filtros REAL y declarar el listado como pendiente.
- Si no llegaron `DESPACHADO` o `ENTREGADO`, el estado del pedido se muestra como `PAGADO`, sin simular el cambio.

## Acta para registrar al terminar

Fecha y hora, asistentes, entorno, SHA FE/BE/SPECS, resultado por tramo con etiqueta MOCK, REAL o LAB, enlaces sanitizados, incidencias y retest. Andrés valida el acta de [#326](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/326).
