# Integración G6 Pricing e Inventory — contrato rc.3

Fecha: 06/11/2026. Alcance: issues #182 y #192. Contrato oficial: OpenAPI `0.6.0-rc.3`, Docs SHA `a7778ec1a22811c1213a94ef096ab905911342cc`.

## Implementado en G1

- Precio vigente: `GET /api/v1/precios/skus/{sku}?canal=MARKETPLACE`; valida moneda PEN, precio regular/oferta, versión, canal global o MARKETPLACE, vigencia y origen.
- Disponibilidad: `GET /api/v1/inventario/disponibilidad/comercial`; agrupa hasta 100 SKU y conserva `INDETERMINADO` como `UNDETERMINED`, sin convertirlo en agotado.
- Cantidad: `POST /api/v1/inventario/disponibilidad/comercial/verificar`; envía la cantidad total deseada, `channel_id=MARKETPLACE` y `fulfillment.mode=ENVIO_DOMICILIO`. No envía `Idempotency-Key`, no reserva y exige `binding=false`.
- Fulfillment: no se exige ni se inventa `fulfillment_ref` para ENVIO_DOMICILIO.
- Autenticación: Catálogo público no recibe credenciales. Pricing e Inventory solicitan a G7 un JWT técnico de `modulo-marketplace` con los scopes `precios:leer` e `inventario:disponibilidad:leer`; el token se cachea, renueva y nunca se persiste.
- Seguridad: allowlist de rutas/métodos, timeout máximo 5 s, validación estricta de respuestas y fallo cerrado sin filtrar cuerpo del proveedor.

## Evidencia local y límite

Las pruebas unitarias y HTTP locales cubren token válido, scopes acumulados, cache/renovación, catálogo público sin Authorization, Pricing/Inventory autenticados, suficiencia, insuficiencia, indeterminación, errores y timeout. Esta evidencia acredita el adaptador contra el contrato fijado; no acredita homologación REAL.

Para cerrar la homologación aún se requiere que G7 conceda efectivamente ambos scopes al cliente `modulo-marketplace` con audiencia `api-productos`, entregar la credencial técnica por secret manager y ejecutar contra G6 los SKU acordados. Deben guardarse trazas sanitizadas de casos positivo, insuficiente, indeterminado, precio ausente y token inválido/vencido/scope insuficiente, además del SHA desplegado y aceptación bilateral.
