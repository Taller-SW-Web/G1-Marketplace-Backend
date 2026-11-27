# BE #45 · Verificación del destacado editorial

Fecha de ejecución: 2026-11-27 UTC  
BFF comunicado para el corte APIM: `bcac2f6b279954c43bfa067a773c6629c6bbc502`  
Producto esperado: `g6-qa-marketplace-ord-001` (`93f7f500-077d-432e-be98-31cb9ee0d66d`)

## Verificador de Home

El primer intento del verificador de `GET /api/v1/catalog/home` contra `https://g1-marketplace-backend.onrender.com` no recibió respuesta dentro del límite inicial de 20 segundos. El reintento exitoso está documentado abajo.

- Hora: `2026-11-27T19:50:19.215Z`
- Request ID generado: `ea051298-488c-476d-85e8-2dcb912fe67c`
- Resultado: `BLOCKED / NETWORK_OR_TIMEOUT` después de `20.013 s`
- No se recibió respuesta HTTP; por tanto, no se observó `X-Catalog-Source`, `Cache-Control`, categorías ni destacados.

Este intento no confirma ni contradice la lectura anterior informada por Diego (`X-Request-Id: 55c0f228-cc48-43af-8303-e6d296412296`). La respuesta del verificador está en [`TASK-F006-INT-001-editorial-featured.json`](TASK-F006-INT-001-editorial-featured.json).

## Acceso a Vercel

- `GET https://g1-marketplace-frontend.vercel.app/` respondió HTTP `200` en `0.315 s`, con `13,513` bytes.
- Una navegación de navegador a la portada quedó pendiente al límite de `15 s`. No produjo snapshot ni observación visual del destacado.

El HTTP 200 confirma que la portada respondió a la petición directa. La revisión visual del producto destacado no quedó verificada en este intento.

## Reintento desde red pública

El `2026-11-27T20:04:36.132Z` se repitió una sola vez el GET del BFF con el mismo UUID esperado y límite de espera configurado en 30 segundos. Respondió antes de agotarlo:

- Request: `GET /api/v1/catalog/home`
- HTTP: `200`
- `X-Catalog-Source`: `REAL`
- `Cache-Control`: `no-store`
- `X-Request-Id`: `97fe5ce7-b37c-4e72-8718-7e41e8a33740` (eco confirmado)
- Duración del verificador: `3.203 s`
- Respuesta: 10 categorías y un destacado; el producto esperado `93f7f500-077d-432e-be98-31cb9ee0d66d` aparece exactamente una vez.

Render registró la misma petición el `2026-11-27T20:04:39.236Z`: `CatalogRequestInterceptor` observó `/api/v1/catalog/home`, fuente `REAL`, estado `200`, duración `2.780 s`; `HttpAccess` registró estado `200` en `2.784 s`. La instancia fue `srv-db05v0navr4c73e9mnug-ckjd4`. El servicio figura no suspendido y el deploy activo corresponde al SHA `bcac2f6b279954c43bfa067a773c6629c6bbc502` (`dep-dc4t1jh5efls73akful0`).

La primera ejecución bloqueada se conserva como antecedente del arranque en frío. Este resultado confirma el criterio funcional observado en el BFF para el reintento. No verifica la revisión visual en Vercel ni sustituye la aceptación independiente del issue. La salida íntegra está en [`TASK-F006-INT-001-editorial-featured-retest-20261127.json`](TASK-F006-INT-001-editorial-featured-retest-20261127.json).
