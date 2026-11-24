# Homologación G7 → G6 para Wishlist

Fecha de ejecución: `2026-11-06T20:58:00-05:00`. Ejecutor: G1 local. No se registraron secretos ni JWT completos.

## Configuración contractual comprobada

- Cliente técnico: `modulo-marketplace`.
- Emisor: `https://g7-auth-service.onrender.com/api/v1/auth`.
- Audiencia del token: incluye `api-productos`.
- Tipo: `servicio`.
- Vigencia: `3600` segundos.
- Scopes requeridos presentes: `precios:leer` e `inventario:disponibilidad:leer`.
- JWKS público: HTTP `200`, una clave RSA con `kid`.

## Resultados sanitizados

| Etapa | Resultado | Duración aproximada | Observación |
|---|---:|---:|---|
| G7 `client_credentials` | HTTP 200 | 581 ms | Token Bearer válido; ambos scopes presentes. |
| Health Gateway G6 | HTTP 200 | 880 ms | El Gateway respondió. |
| Catálogo: detalle por ID | HTTP 503 | 11.1 s | Sin datos de producto; no se sustituyó por fixture. |
| Pricing: precio por SKU | HTTP 503 | 319 ms | Sin precio; G1 no inventa valor. |
| Inventory: disponibilidad comercial | HTTP 503 | 84 ms | Sin estado; G1 no interpreta el error como agotado. |
| Inventory: verificar cantidad | HTTP 503 | 94 ms | Sin reserva ni escritura; no se asumió suficiencia. |

Producto/SKU de prueba: producto `32a4172c-81b2-b643-1d0f-ae66f627f2ef`, SKU `ADI-ENT22-AZU-M`, canal `MARKETPLACE`, fulfillment `ENVIO_DOMICILIO`, cantidad total `1`.

## Veredicto

El aprovisionamiento de G7 queda comprobado desde G1: emisión, issuer, audiencia, tipo, vigencia y permisos son compatibles. La solicitud incluyó los scopes requeridos y G7 la aceptó; no hace falta retirar ese parámetro para este entorno.

La homologación extremo a extremo no pasa todavía. El Gateway G6 está activo, pero las cuatro operaciones de negocio relevantes respondieron `503`. Las issues #182 y #192 deben dejar de figurar como bloqueadas por G7 y permanecer bloqueadas por G6/homologación hasta que G6 confirme el estado de sus servicios desplegados y se repitan los casos positivo, negativo y timeout.
