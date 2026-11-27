# Checklist del congelamiento H5 · Viernes 27/11/2026

Jim registra el candidato y Andrés lo revisa. Estado al jueves 26/11/2026 a las 19:30 (Lima). Código congelado a las **13:00**, evidencia congelada a las **15:00**, informe con go/no-go a las **17:00**. Cada línea distingue **REAL** (servicio de otro equipo o de producción) de **MOCK** (simulado) y de **LAB** (laboratorio local de G1).

## Referencias al corte del 26/11

| Repositorio | `develop` | `main` (desplegado) | Última etiqueta |
|---|---|---|---|
| Backend | `a57035c` | `f17896d` (corte del 26/11 a las 14:49; Render lo despliega solo) | `v1.18.0` |
| Frontend | `e933d60` | `50eb973` | `v1.8.0` |
| SPECS | `aafa006` | `bc79ee2` | — |

El candidato final se registra al cerrar el corte a `main` del viernes: SHA de los tres repositorios, URL y último despliegue funcional restaurable.

## Hecho, con evidencia

- [x] **Compra REAL con Ventas.** `PED-2026-00092` creado a las 15:06:11 (`POST /checkout/orders` → 202), confirmado en la base de Ventas y en **PAGADO** a las 15:17:04. Lectura por el BFF con la cuenta A (15:26 y 18:38, HTTP 200) y repetición idempotente sin duplicado (15:46:09). Cotización y revalidación **MOCK**. Informes en `docs/evidencias/H5/integracion-real/` (BE #405).
- [x] **Ronda 1 REAL por el BFF con Seguridad (16:00).** 19 de 19 casos, 16:00:23–16:00:32 Lima, sin 429 (BE #405). Sin la rama con MFA ni el registro nuevo.
- [x] **Ronda 3 REAL por el BFF con Seguridad (20:20), con MFA.** 24 de 24 casos, 20:20:27–20:21:03 Lima, sin 429, mismo BFF `f17896d` y origen de Vercel: registro nuevo 201 pendiente de verificación, login con MFA de la cuenta B (desafío 200, OTP por correo 200, sesión solo tras verificar), contraseña incorrecta 401, logout y refresh, direcciones y recuperación neutra (BE #26, #30, #34, #38; informe en `integracion-real/bff/2026-11-27/`). Por separado, aislamiento de B a las 19:34: `GET /orders/me` 200 con 0 pedidos y `GET /orders/PED-2026-00092` 403 (`84fc5c34-cedf-4d73-8962-4dbb0c4996ff`).
- [x] **Webhook de Ventas (H-05).** 7 eventos reales persistidos en `shipment_event_inbox` (11:05:47–11:05:50), 401 con token ausente o incorrecto, duplicado detectado (`duplicate: true`) (BE #318, #357, #365).
- [x] **Correo C-002.** `DESPACHADO` de un pedido de prueba: envío 17:07:59 Lima → HTTP 200 `accepted:true, duplicate:false`; reenvío del mismo `eventId` 17:09:12 → HTTP 200 `duplicate:true`. Llegó un solo correo por Brevo (BE #162, BE #381). En un ensayo previo al corte de C-002, el reenvío (16:13:01) también devolvió `duplicate:true` y no generó correo.
- [x] **RabbitMQ con Seguridad (G7), recepción y recuperación manual.** Entrega automática REAL de `usuario.creado` v1 (publicado 18:50:05, registrado 18:50:08, una fila) con BE #409 (`769e3b7`). Seis rechazos directos a DLQ sin retry; dos lotes manuales de tres, una fila por ID y DLQ preservada. Total: 8 filas / 8 IDs únicos. Ver [matriz asíncrona](asincrono/README.md); esto no acredita redelivery ni backoff automáticos.
- [x] **Performance.** k6 local en Docker con terceros simulados: carga, estrés con quiebre a 800 VUs, recuperación, spike, soak de 5 min y antes/después de la caché; reporte en `docs/evidencias/H5/performance/be-391/` (BE #396). **LAB**, no producción.
- [x] **Gobierno del repositorio.** Regla `develop-governance-h5` (1 aprobación y checks obligatorios), CODEOWNERS (FE #175) y pipeline unificado en `develop` (BE #359).
- [x] **Credencial del broker.** Rotada al terminar la sesión con G7; la nueva se entrega solo a quien haga #316.

## Pendiente antes de las 13:00 (código)

- [ ] **Corte `develop` → `main`** con todo lo anterior (incluye BE #409, #403 y #389). Esperar el despliegue y comprobar `/health`, la compra (lectura de `PED-2026-00092`) y el catálogo (inicio y filtros 200).
- [ ] **Mecanismo del 503 controlado (BE #320).** Apagado por defecto, de un solo uso, solo para un `orderId` sintético, con migración aditiva. Revisión de Jim y despliegue antes de las 10:30.
- [ ] **Listado del catálogo (BE #213).** G6 responde, pero el BFF rechaza el host de las imágenes (`UNAPPROVED_MEDIA_HOST`). Giuliano confirma los dominios exactos y **solo Jim** actualiza `PRODUCTOS_MEDIA_HOSTS` en Render con esos dominios; no se amplía la lista sin esa confirmación. Después se verifica `/catalog/products` con 200.
- [ ] **Validación del token de catálogo (BE #403).** Comprobar con un token REAL de G7 que el formato de los claims (`scope` y `aud`) coincide con lo que valida el BFF, y tras el corte verificar inicio y filtros con 200. Si el smoke falla, **no se retira la validación**: se diagnostica la causa (formato de claims, secreto, host) y, si hay que volver atrás, se redespliega el SHA anterior.
- [ ] **`.releaserc.json`** sin los plugins `git`, `changelog` y `npm` (Andrés), para que semantic-release no intente empujar a una rama protegida.
- [ ] **Rediseño del Frontend** (FE #164 → #166 → #167) con revisión y regresión de login y checkout entre cada paso; si a las 11:00 no están los tres, congelar el último SHA verificado.
- [ ] **Variables de Render conservadas** tras cada cambio: `CHECKOUT_SALES_SOURCE=g5`, `CHECKOUT_ADDRESS_SOURCE=g7`, `ORDERS_SOURCE=real`, `G5_SALES_INTEGRATION_APPROVED=true`, `G5_CONTRACT_PRODUCT_FALLBACK_ENABLED=false`, `CHECKOUT_G5_TEST_FIXTURE`, las de C-002 y CSAT, y `PRODUCTOS_CLIENT_SECRET` igual a `G7_SERVICE_CLIENT_SECRET`.

## Pendiente antes de las 15:00 (evidencia)

- [ ] **Entrega `DESPACHADO` y `ENTREGADO` REAL** del pedido `PED-2026-00092` (Ventas y Despacho): aporta la evidencia de **seguimiento** (BE #319 y el estado del pedido) y habilita el CSAT. **No cierra por sí sola** BE #116, #117 ni FE #60: esas issues conservan sus criterios propios (aislamiento y dirección ajena por el BFF, homologación G-ADDRESS, logs del corte, retest de V-010 y revisión independiente). Se verifica por lectura del BFF, sin crear otro pedido.
- [ ] **CSAT:** `POST` con la cuenta A → 201 y repetición → 409 `CSAT_ALREADY_SUBMITTED` (requiere `ENTREGADO`).
- [ ] **Aislamiento con la cuenta B:** `GET /orders/me` sin el pedido de A y `GET /orders/PED-2026-00092` → 403.
- [ ] **Ronda 3 con Seguridad** (propuesta viernes 09:00–09:30): registro nuevo, camino con MFA, JWT inválido o expirado, CSRF de logout y recuperación con enlace vencido.
- [ ] **APIM por política (BE #394) — NOT_RUN.** Ventana 27/11, 10:00–10:30 Lima, pendiente confirmar suscripción QA, revisión activa y logs del BFF. El export XML también está pendiente. Las rutas de docs propuestas para MISS/HIT están excluidas por #308; no usarlas. Ver [matriz APIM](apim/README.md).
- [ ] **Resiliencia en RabbitMQ compartido (BE #315/#394) — NOT_RUN.** Falta redelivery automática de un duplicado, backoff con agotamiento y caída/recuperación. Mantener la DLQ intacta y separar esas pruebas del [laboratorio y la recuperación manual REAL](asincrono/README.md).
- [ ] **Ventana con Ventas (BE #320)**, 11:30–12:00 (respaldo 14:00–14:30): un 503 controlado, reintento con el mismo `eventId` y `correlationId`, una sola fila, traza sanitizada. Si Ventas no reintenta, documentarlo como límite.
- [ ] **Reacción a bloqueo y purga (BE #316)** con la credencial nueva del broker (Leonidas y Diego).
- [ ] **Rollback ensayado (BE #289)** con Andrés y Saire: SHA anterior y nuevo, `/health` antes y después.
- [ ] **SAST/DAST (BE #393):** 3 hallazgos de Semgrep clasificados, 2 alertas de ZAP del Top 10, ciclo hallazgo–corrección–retest, Trivy y SBOM.
- [ ] **Matriz de integración (BE #291), trazabilidad (BE #299) e informe de pruebas con go/no-go (BE #392).**
- [ ] **E2E del Frontend (FE #138)**: resultado parcial ya registrado (catálogo público REAL; login desde un origen local rechazado por diseño con 403; checkout simulado).

## Firma y etiqueta (15:00–17:00)

- [ ] Registrar la etiqueta efectiva de release, su enlace y el SHA del candidato aprobado.
- [ ] Anexar el acta del ensayo (BE #326) y el paquete de evidencia (BE #324).
- [ ] Jim firma; Andrés valida la secuencia de rollback del candidato.

## Límites que se declaran en la exposición

- Cotización y revalidación de la compra: **MOCK** (fixture).
- Catálogo: inicio y filtros **REAL**; listado pendiente por el host de imágenes de G6.
- Reacción a bloqueo (BE #316) y hasta con 6 decimales: laboratorio.
- La medición de performance es local con terceros simulados.
- Pruebas de la cuenta B, CSAT y entrega real de Despacho: según lo que exista a las 15:00; lo que no esté se marca **NO EJECUTADO**, sin sustituirlo por evidencia simulada.
