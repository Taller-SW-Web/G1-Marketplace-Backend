# Checklist del congelamiento H5 · Viernes 27/11/2026

Jim registra el candidato y Andrés lo revisa. **Estado al viernes 27/11/2026, ~19:00 (Lima).** Código congelado a las 13:00, evidencia congelada a las 15:00, informe go/no-go (#392) en la PR #435. Cada línea distingue **REAL** (servicio de otro equipo o producción), **MOCK** (simulado) y **LAB** (laboratorio local de G1). Lo que el PO no pudo comprobar hoy se marca **NO VERIFICADO**, no como hecho.

## Referencias al corte del 27/11

| Repositorio | `develop` | `main` | En ejecución | Última etiqueta |
|---|---|---|---|---|
| Backend | `2d2fcc9` | `bcac2f6` | **`bcac2f6`** en Render (Deploy #30, 13:52–13:54 Lima; confirmado por Andrés) | `v1.21.0` (con SBOM y SARIF de Trivy adjuntos) |
| Frontend | `2eda3b1` | `ce72b5d` | **Promovido a Production por el PO** (despliegue de `main` #188); `/registro` verificado desde fuera con el formulario real | `v1.9.0` (sin adjuntos) |
| SPECS | `aafa006` | `bc79ee2` | — | — |

`develop` y `main` divergieron (BE: 66 y 76 commits; FE: 19 y 4). **Decisión del PO:** no se corta `develop` → `main` en el Backend antes de la presentación; se hará como release normal después, con Andrés. **Candidato final para la presentación = lo que hay hoy en `main`.**

## Hecho, con evidencia

- [x] **Compra REAL con Ventas.** `PED-2026-00092` (BE #405), lectura por el BFF con la cuenta A, 15:15 Lima: 200, EN_PREPARACION. Cotización y revalidación **MOCK**.
- [x] **Ronda 1 y ronda 3 REAL por el BFF con Seguridad (26/11).** 19/19 (16:00) y 24/24 con MFA (20:20), sin 429, commit `f17896d`. Informes en `docs/evidencias/H5/integracion-real/`.
- [x] **Cadena REAL Ventas → Despacho → G1: `PED-2026-90013` hasta ENTREGADO** (18:13:41Z). Mis pedidos REAL: 200 para el titular, **403 para otro cliente** (cuenta E; la cuenta B pide MFA y no se automatiza).
- [x] **Reintento idempotente del webhook de Ventas (BE #320), REAL, controlado.** 503 armado 18:13:17.856Z (`requestId a287fca4-69f8-4d0a-bd79-3ac30941e68f`) → 200 18:13:23.317Z (`d91d4ec1-5a43-4b6d-9d1e-a8c4992cf5a5`), mismo `eventId`, **1 fila** por `eventId` en `shipment_event_inbox`. Caso `PED-2026-90012`: REAL no controlado. Detalle en el informe #392 (PR #435).
- [x] **CSAT del `PED-2026-90013`, REAL (prompt sembrado manualmente).** Registrada en Ventas a las 21:16:59Z (puntaje 5); el BFF respondió 503 por el timeout de 5 s (`a837d22a-…`, 5669 ms) y la segunda llamada devolvió **409 `CSAT_ALREADY_SUBMITTED`** (21:21:06Z, `a0b8e514-5a32-481d-9430-2dce6613d862`). Hallazgo: ningún código del repo crea la fila `post_delivery_prompts` en SHOWN.
- [x] **Catálogo REAL por el APIM de G6** (inicio, filtros y listado, 200; `ord-001` destacado). Lectura de solo lectura 15:15 Lima: 10 de 10 con 200. Validación del token de G7 (`aud=api-productos`, `catalogo:leer`): verificada por Seguridad.
- [x] **Incidente de G6 (causa externa)** y **503 del catálogo 13:09:36–13:15:53 Lima** (`PROVIDER_INVALID_RESPONSE`): documentados en el informe #392. Causa aguas arriba del segundo, sin determinar.
- [x] **Webhook de Ventas (H-05).** Eventos reales persistidos, 401 con token ausente o incorrecto, duplicado detectado.
- [x] **OTP con diseño nuevo.** Correo recibido 15:31 Lima; Seguridad confirma Live en G7 (`3d2b564`).
- [x] **Gobierno del repositorio.** Ruleset `develop-governance-h5` activo (1 aprobación, CODEOWNERS, checks obligatorios), `main` y `develop` protegidas, environment `production` con revisores (BE y FE), pipeline unificado en `develop` (BE #359, FE #165), Dependabot activo en BE.
- [x] **Performance.** k6 local en Docker con terceros simulados (BE #396, #345): **LAB**, caché apagada (TTL=0).
- [x] **Informe de pruebas go/no-go (#392).** PR #435, aprobada por el PO; incluye la sección del PO con **GO condicionado**.
- [x] **Credencial del broker.** Rotada al terminar la sesión con G7.

## Pendiente o con desviación (código)

- [~] **`.releaserc.json` sin los plugins `git`, `changelog` y `npm`: hecho (BE #436, FE #192, fusionadas 27/11).** El GH013 se resolvió, pero **el job «Versionado» sigue en rojo** en `develop` (BE run 46080624663, FE run 46080625214) por `fatal: tag already exists`: `develop` y `main` divergieron. Se corrige reconciliando las ramas en el corte posterior a la presentación. Último CI-CD de `develop` totalmente verde en BE: la fusión de #418.
- [x] **Frontend promovido a Production en Vercel.** El sitio mostraba un build anterior al 21/10; tras promover `main` (#188), `/registro` sirve el formulario real y el BFF responde 10 de 10 en 200.
- [ ] **Rediseño del Frontend (FE #164 → #166 → #167).** NO VERIFICADO por el PO hoy; FE #164/#174 aparecían conflictivas.
- [ ] **Variables de Render.** `ORDERS_SOURCE=real` corregido tras el 503 de Mis pedidos. El resto (`CHECKOUT_SALES_SOURCE`, `G5_SALES_INTEGRATION_APPROVED`, etc.) **NO VERIFICADO por el PO**; no se imprimen valores.
- [ ] **PR preparadas, no integradas:** BE #429 (Fase 1 del runner, con conflicto), #430 y #400 (OpenAPI desactualizado), #395 y la PR de documentación de #413 (post-freeze, sin fusión antes del sábado), FE #172 y #163.

## Pendiente o con desviación (evidencia)

- [ ] **Ronda 3 y aislamiento con la cuenta B:** ronda 3 hecha el 26/11 (24/24). Aislamiento del 27/11 con la cuenta E (la B pide MFA).
- [ ] **APIM por política (BE #394): NOT_RUN** (confirmado por Leonidas el 27/11). Solo hay un 401 sin JWT histórico (25/11 02:57:35.767 UTC) y evidencia parcial de correlación; 429 con `Retry-After`, MISS/HIT y correlación contra logs del BFF no están acreditados; `/v1/docs` está fuera del subset contratado y falta acordar una ruta cacheable válida. **Resiliencia RabbitMQ (BE #315/#394):** el backoff tiene evidencia de **laboratorio local**; la redelivery y el backoff automáticos en el entorno compartido siguen **NOT_RUN**. El reintento del webhook de Ventas (90013) sí está acreditado REAL, pero no demuestra el backoff del consumidor.
- [ ] **Reacción a bloqueo y purga (BE #316)** con la credencial nueva del broker: NO VERIFICADO.
- [x] **Rollback ensayado (BE #289), Frontend y Backend.** **Frontend (Vercel):** el PO ejecutó Instant Rollback al despliegue anterior de Production y volvió a promover `main` (#188); funcionó. **Backend (Render):** el PO ensayó el redeploy a un deploy anterior y la vuelta; funcionó. Estado final: **deploy Live `bcac2f6` (Deploy #30), confirmado por Andrés en el panel de Render**; registros de `/health` de Andrés, ambos HTTP 200, `status: UP`, base conectada: 17:42:13 Lima (`X-Request-Id 8b3e5052-b9e0-47bb-b393-5c8959dc1571`) y 18:07:45 Lima (`900c3dc8-6e9d-43db-81e0-13d758c0a10a`); lectura del BFF 10 de 10 con 200 (17:47 Lima). **Límite:** las horas exactas de cada paso del rollback y las capturas del panel están por adjuntar (el PO las informó de memoria).
- [ ] **SAST/DAST (BE #393):** SAST, secretos, SCA y ZAP baseline están en verde en las PR; la clasificación de hallazgos y el retest están en #393 (NO VERIFICADO por el PO hoy).
- [ ] **E2E del Frontend (FE #138):** resultado parcial; NO VERIFICADO hoy.
- [ ] **Ensayo de la demo (BE #326):** personal, por segmento; se cierra con el resultado.
- [ ] **Ensayo de timeout de direcciones (BE #115, #116)** y **límite de intentos de login (BE #30):** después de la presentación (Seguridad, entorno aislado).
- [ ] **Revisión de logs (BE #38, #41, #42, #115, #116):** **parcial** (sin datos sensibles visibles; los request IDs del BFF no se pudieron vincular). Ronda con IDs nuevos después de la presentación.

## Firma y etiqueta

- [ ] **Etiqueta efectiva del release:** BE `v1.21.0` y FE `v1.9.0`. El versionado de `develop` falla (GH013), por lo que **no se generó una etiqueta nueva** con los cambios posteriores. Se declara.
- [ ] **Anexar el acta del ensayo (BE #326) y el paquete de evidencia (BE #324).**
- [ ] **Jim firma; Andrés valida la secuencia de rollback del candidato** (depende de #289).

## Límites que se declaran en la exposición

- Cotización, revalidación y **checkout: MOCK** (fixtures; el modo bff no está activo, Plan B). V-010 / FE #60: pendiente.
- **Catálogo: inicio, filtros y listado REAL** por el APIM de G6. **Mis pedidos, cadena 90013 y CSAT: REAL** (CSAT con prompt sembrado manualmente).
- **Correos: Mailpit con fixtures** (BE #433, #323 sigue abierta); no se acredita Gmail/Outlook.
- Performance: **local con terceros simulados**; caché apagada (TTL=0).
- «Sin secretos en logs»: **revisión parcial**, no verificada.
- Frontend desplegado: `main` (#188) promovido a Production el 27/11; el checkout sigue en fixtures (MOCK).
- Secretos expuestos en un chat el 27/11: **rotación después de la presentación**, coordinada con Seguridad y Andrés.
- Pruebas de la cuenta B, redelivery/backoff de RabbitMQ y APIM por política: según lo que exista; lo que no, **NO EJECUTADO**.
