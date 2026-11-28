# Hito 5 · Insumos del PO para el informe go/no-go (#392)

**Fecha:** viernes 27/11/2026, ~16:45 Lima · **Responsable:** Jim Segovia (PO, G1 Marketplace) · **Para:** Diego (autor del informe)
**BFF (Render, despliega `main`):** **`bcac2f6` en ejecución (Live), confirmado por Andrés en el panel de Render**: Deploy #30, 13:52–13:54 Lima (18:52–18:54 UTC), trigger «Environment updated». Es también el último merge a `main` (PR #360, 11:45 Lima). · **Frontend (Vercel):** FE #188 incorporó `ce72b5d` a `main` en GitHub (27/11 09:42 Lima, v1.9.0). La verificación pública posterior de [`/registro`](https://g1-marketplace-frontend.vercel.app/registro) devolvió HTTP 200 y mostró el formulario de creación de cuenta con sus campos de registro. La revisión exacta que sirve el alias de producción queda por confirmar en Vercel.

Etiquetas: **REAL** (contra sistemas reales) · **MOCK** (fixtures o datos simulados) · **LAB** (entorno controlado) · **PEND** (no ejecutado). Este documento no contiene secretos, contraseñas, tokens ni correos personales. Ninguna issue se da por cerrada sin evidencia.

---

## 1. Recomendación del PO
**GO condicionado.** Lo central funciona REAL (catálogo por el APIM de G6, Mis pedidos, cadena Ventas→Despacho→G1 hasta ENTREGADO, reintento idempotente del webhook y CSAT). Lo que no está probado REAL se declara como pendiente en la sección 5 y no se presenta como cumplido. La compra (checkout) se muestra como MOCK.

---

## 2. Estado por componente
| Componente | Estado | Etiqueta |
|---|---|---|
| Catálogo (G6 por APIM, JWT de G7), `ord-001` destacado | 200 en inicio, filtros y listado | REAL |
| Mis pedidos | 200 para el titular (PED-2026-90013 ENTREGADO); 403 para otro cliente | REAL |
| Cadena Ventas → Despacho → G1 | PED-2026-90013 hasta ENTREGADO | REAL |
| Reintento idempotente del webhook | 503 → 2xx con el mismo `eventId`, 1 fila | REAL (controlado) y REAL (no controlado, 90012) |
| CSAT del PED-2026-90013 | Registrada en Ventas; duplicado rechazado con 409 | REAL (prompt sembrado manualmente) |
| Registro, MFA, tokens inválidos | 201 sin sesión hasta verificar; MFA sin bypass; 401 en tokens inválidos | REAL |
| OTP de inicio de sesión (diseño nuevo) | Correo recibido 15:31 Lima; Seguridad confirma Live en G7 (despliegue `3d2b564`) | REAL |
| Direcciones | API 200/201/400/401 | REAL (API) |
| Pantalla de direcciones y checkout | Fixtures; modo bff no activo (decisión del PO) | **MOCK** |
| Correos | Mailpit con fixtures; no acredita Gmail/Outlook (BE #433; #323 sigue abierta) | MOCK / LAB |
| Rendimiento (#345) | Parcial: caché apagada (TTL=0), terceros simulados; #304 abierta | MOCK / LAB |
| Cobertura de CI (FE #174, fusionada 15:09 por Andrés) | Reporte publicado; falta `coverage.include` en `vitest.server.config.mts`. **No citar el %** | Alcance por corregir |
| PR preparadas, no integradas | #429 (Fase 1 del runner: sin resultados reales y con conflicto), #430 y #400 (OpenAPI desactualizado; base 2763df8, develop en 2d2fcc9), PR de documentación de #413 (no se fusiona antes del sábado) | No cuentan como evidencia |

---

## 3. Evidencia clave

### 3.1 Lectura de solo lectura del BFF, 27/11 15:15 Lima: 10 de 10 con 200
Salud (`3c301687`), catálogo inicio (`f521d0ef`), filtros (`79532334`), listado (`082e23f0`), login de la cuenta A (`492800d3`), carrito (`6d651f4a`), Mis pedidos (`b7635db2`), detalle de pedido (`4cc4473e`), direcciones por G7 (`f7cf95e3`), logout. Request IDs abreviados (8 caracteres).

### 3.2 Reintento idempotente del webhook de Ventas
**PED-2026-90013 (REAL, controlada).** 503 armado por QA en el BFF de Render (armado: Diego, 13:06:47 Lima, deploy `dep-dc4sctl6e07s738fl4ag`, válido hasta 20:00Z).

| Hora (UTC) | Hecho |
|---|---|
| 18:13:17.856 | DESPACHADO `bd6997af-7e55-4211-a422-ded2f49b307a`, intento 1 → **503** `SHIPMENT_EVENT_PERSISTENCE_UNAVAILABLE` (`requestId`: `a287fca4-69f8-4d0a-bd79-3ac30941e68f`, `correlationId`: `5580e7a6-1d31-447d-8aa0-205d354b84c0`) |
| 18:13:23.317 | Mismo `eventId` y cuerpo, intento 2 → **200** `accepted`, 5.5 s después (`requestId`: `d91d4ec1-5a43-4b6d-9d1e-a8c4992cf5a5`, `correlationId`: `46afff8f-c550-426b-ba61-532791c2d9fd`) |
| 18:13:23.311 | `shipment_event_inbox`: **1 fila** para `bd6997af-…` (cotejo de solo lectura) |
| 18:13:41 | Pedido ENTREGADO en Ventas |
| 18:13:49.187 | ENTREGADO `fec559bb-8d93-438f-9861-344b72be2275` al primer intento → **200** `accepted` (`requestId`: `d3043495-3a6c-4764-a361-484cc37ddaed`); **1 fila** en `shipment_event_inbox` |

**Logs sanitizados de Render (`srv-db05v0navr4c73e9mnug` — `g1-marketplace-backend`):**

```text
2026-11-27T18:13:17.856451147Z WARN [ShipmentWebhookService] {"event":"shipment_webhook_qa_503","correlationId":"5580e7a6-1d31-447d-8aa0-205d354b84c0","eventId":"bd6997af-7e55-4211-a422-ded2f49b307a","orderId":"PED-2026-90013"}
2026-11-27T18:13:17.85731912Z  LOG  [HttpAccess] {"event":"http_access","requestId":"a287fca4-69f8-4d0a-bd79-3ac30941e68f","method":"POST","route":"/api/v1/webhooks/ventas/envios","status":503,"elapsedMs":8}
2026-11-27T18:13:23.317830615Z LOG  [ShipmentWebhookService] {"event":"shipment_webhook_processed","correlationId":"46afff8f-c550-426b-ba61-532791c2d9fd","eventId":"bd6997af-7e55-4211-a422-ded2f49b307a","orderId":"PED-2026-90013","outcome":"accepted"}
2026-11-27T18:13:23.318272357Z LOG  [HttpAccess] {"event":"http_access","requestId":"d91d4ec1-5a43-4b6d-9d1e-a8c4992cf5a5","method":"POST","route":"/api/v1/webhooks/ventas/envios","status":200,"elapsedMs":11}
2026-11-27T18:13:49.187936636Z LOG  [ShipmentWebhookService] {"event":"shipment_webhook_processed","correlationId":"882d510e-6158-41dd-9256-51d218f8aaf6","eventId":"fec559bb-8d93-438f-9861-344b72be2275","orderId":"PED-2026-90013","outcome":"accepted"}
2026-11-27T18:13:49.188402217Z LOG  [HttpAccess] {"event":"http_access","requestId":"d3043495-3a6c-4764-a361-484cc37ddaed","method":"POST","route":"/api/v1/webhooks/ventas/envios","status":200,"elapsedMs":7}
```

**PED-2026-90012 (REAL, no controlada).** 05:32:08Z DESPACHADO `a9ac8093-2391-4540-8f8a-8749914dce8c`, intento 1 sin respuesta (reinicio de Render); 05:32:20Z intento 2 con el mismo `eventId`, entregado; 1 fila en el inbox (Leo).
Límite: el estado autoritativo del pedido lo tiene Ventas.

### 3.3 CSAT del PED-2026-90013
Etiqueta: **REAL contra Ventas, con el prompt sembrado manualmente** (ningún código del repo crea la fila `post_delivery_prompts` en SHOWN; la sembró Andrés).
| Hora (UTC) | Hecho |
|---|---|
| 19:09:32 y 19:09:59 | 503 `SALES_UNAVAILABLE` (reqs `dfb2055f-1264-4cc6-a3cd-ff80412ba794`, `495b7b9f-4b78-4acf-9e4d-1857b598e5a7`). Ventas: el POST recibió 429 de Render; su Postventa estaba dormido (plan gratuito) |
| 21:10:03 | 503 en **959 ms** (req `592b2f10-74d0-4ac0-ad77-c21cf146fc58`): no fue timeout, sino rechazo rápido. Ventas: el POST recibió 429 de Render por la misma causa. Logs del BFF: Andrés |
| 21:16:59 | **POST registrado en Ventas** en 4.97 s (Postventa despertando): puntaje 5, canal MARKETPLACE. El BFF cortó a los 5 s (`HTTP_TIMEOUT_MS=5000`) y respondió 503 tras **5669 ms** (req `a837d22a-77ee-42e7-9c67-b55ae49634cf`, confirmado en los logs de Render): la respuesta se perdió, la CSAT no |
| 21:21:06 | Segunda llamada por el BFF → **409 `CSAT_ALREADY_SUBMITTED`**, 1.7 s (req `a0b8e514-5a32-481d-9430-2dce6613d862`) |

Ventas lo dejó registrado en su acta (21:16:59Z éxito, 21:21:06Z duplicado 409). El éxito del primer POST se acredita con los logs y la base de Ventas, no con la respuesta de nuestro BFF.

### 3.4 Incidente de G6 (Productos), causa externa
| Hora (Lima) | Hecho |
|---|---|
| 09:22 | Catálogo 200 REAL (10 de 10) |
| 09:32 | Primer `PROVIDER_HTTP_403` en logs de Render (36 entre 09:32 y 10:08; antes del guardado de variables de las 09:53) |
| 10:08 | Catálogo con 503 `CATALOG_UNAVAILABLE` (reqs `b77dea84`, `e26a8944`, `6c6759f7`, `0326e598`). Último 403: `194c5d45-88a4-4155-8450-6c8a80602141` a las 15:08:38.557Z |
| 10:15 | Despacho responde 503 `DESP_ERROR_PRODUCTOS_NO_DISPONIBLE` al sellar el 90013 |
| 10:20:29 | Primer 200 posterior en `/api/v1/catalog/products` (req `10760a25-7910-4eb0-b4ea-b42d4dbe79d8`) |
| ~10:30 | G6 explica la migración a su API Manager de Azure y que la URL anterior ya no se usa |

**Causa:** migración de G6 a su APIM (`apim-g6-productos-chile.azure-api.net`) sin aviso previo ni habilitación de los `client_id` consumidores; afectó también a Despacho. **Resolución:** flujo client-credentials del BFF con un JWT de G7 (`aud=api-productos`, `tipo=servicio`, `catalogo:leer`). Un token opaco previo daba 401. Seguridad (G7) da por verificada la llamada de Marketplace a G6 a partir del 200 REAL de las 15:15 Lima.

### 3.5 Mis pedidos
Un `ORDERS_SOURCE` mal configurado devolvía 503 `ORDERS_INTEGRATION_UNAVAILABLE`; corregido con `ORDERS_SOURCE=real`. Hoy la cuenta A lista sus pedidos con 200 y ve el PED-2026-90013 ENTREGADO; una cuenta de otro cliente recibe 403 al pedir ese pedido (aislamiento).

---

## 4. Hallazgos
1. **Nada en el repo crea `post_delivery_prompts` en estado SHOWN.** Sin la siembra manual, la CSAT de un pedido ya entregado no es elegible. Necesita un disparador (p. ej. al pasar a ENTREGADO).
2. **Timeout de 5 s del BFF frente al arranque en frío de Postventa:** el cliente vería error aunque la CSAT se guarde. Opciones: subir `HTTP_TIMEOUT_MS` (guardado en Render, reinicia el BFF; después de la presentación) o tratar el timeout como resultado incierto.
3. **Catálogo con 503 entre 13:09:36 y 13:15:53 Lima (18:09–18:16 UTC), recuperado a las 13:18:15 (primer 200 REAL).** Código de motivo en los logs de Render (Andrés): `PROVIDER_INVALID_RESPONSE`, status 503, con duraciones de ~10.1–10.5 s por petición (primer error `aafb2c23-33a3-4b13-bc35-3e31cfeb5f1d`, último de la racha `2fe9c7f7-bd75-46fb-82b5-4ee040b7e68f`, primer 200 `a34721f3-c77e-43e2-941c-94a9a32ee6b7`). La duración apunta a una espera larga del proveedor, pero **la causa aguas arriba no está determinada** (hipótesis sin confirmar: arranque en frío de G7 o G6).
4. **Secretos expuestos en el chat** (volcado de variables de entorno). Rotación **después de la presentación**: Brevo, base de datos, clave de sesión, secreto de G7, token del webhook de Ventas, secreto de mocks. Sin valores en este documento. Seguridad (G7) coordina la rotación con Andrés.
5. **`semantic-release` en `develop` falla con GH013** (solo el paso de release; los jobs de código pasan). Dueño: Andrés.

---

## 5. Pendientes declarados (no se presentan como cumplidos)
- **Checkout real por el BFF y V-010 (FE #60, FE #154):** no activado (Plan B). Exige un guardado en Render con reinicio y un cambio en Vercel.
- **Prueba controlada de 503 y timeout del catálogo (BE #49, FE #30):** no hecha; solo hay evidencia REAL no controlada (3.4).
- **Ensayo de timeout de direcciones (BE #115, #116):** autorizado por G7 (una consulta, plazo corto, sin reintentos); exige bajar `HTTP_TIMEOUT_MS`, que afecta todas las llamadas a G7. Después de la presentación.
- **Límite de intentos de login:** se probará en el entorno aislado de G7 con una cuenta dedicada (BE #30).
- **Retorno desde el correo de verificación (BE #26):** pendiente de comprobar si el enlace trae `canal=MARKETPLACE` y adónde apunta el botón (PO + Seguridad).
- **«Sin email/token/secretos en logs» (BE #38, #41, #42, #115, #116): revisión PARCIAL.** Seguridad (G7) amplió los rangos y encontró trazas de Render del 26/11 (20:20 y 21:05 Lima): inicios y cierres de sesión (incluido un login con MFA) y conteos de correos enviados; en esa muestra no se ven contraseñas, OTP, tokens ni correos completos. Los request IDs del BFF no aparecen en esas líneas (la versión de G7 de entonces no registraba `X-Request-Id`), por lo que **no se pudo vincular cada solicitud** de recuperación ni de tokens inválidos. No se declara verificado. Para vincular por ID se repetirá, después de la presentación, una ronda corta autorizada con IDs nuevos.
- **C-001 sobre el PED-2026-90014 (BE #162, FE #82):** después de la presentación y de la fusión de BE #395; no verificadas.
- **Correos reales (Gmail/Outlook) e integración desplegada de #323:** no acreditados.
- **BE #395, BE #413 (PR de documentación), FE #172 y #163:** después del congelamiento; sin fusión antes del sábado.

---

## 6. Estado de las issues del PO
Se mantienen **abiertas** con estado final publicado el 27/11: BE #26, #30, #38, #41, #42, #115, #116 y FE #60. **#326** (ensayo y datos de prueba) se cierra al terminar el ensayo de hoy; **#327** (congelamiento y checklist) cuando el checklist de `develop` (PR #337, ya fusionada) se actualice con el estado real del 27/11, se registre el candidato final y firmen el PO y Andrés (rollback, BE #289).

---

## 7. Riesgos para la presentación del sábado 28/11
- **Arranques en frío (Render gratuito):** Ventas se compromete a despertar Postventa, Ventas y el gateway ~15 min antes de presentar y mantenerlos activos; falta calentar G7, el BFF y el catálogo por nuestro lado.
- **No guardar variables en Render sin aviso** hasta el sábado: cada guardado reinicia el BFF y los fallos de validación dejan variables pendientes.
- **La compra es MOCK.** La cadena real que se muestra es el PED-2026-90013.
- **No rotar el secreto de G7** hasta después de la presentación.

[Aprobación del PO del informe H5, 27/11/2026](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/435#pullrequestreview-6093936125).
