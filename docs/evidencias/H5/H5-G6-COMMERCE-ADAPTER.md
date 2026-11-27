# H5 — preparación local de adaptadores G6 comerciales

## Contrato fijado

- OpenAPI `0.7.0-rc.3`, commit `40524e96c6973f84d74160076781702fe2a3da19`, blob fuente `e094988f0f0d92a7a4241c1dc30a5e50d9ff709a`.
- `GET /api/v1/precios/skus/{sku}`: `canal=MARKETPLACE`, scope contractual `precios:leer` (registro pendiente).
- `GET /api/v1/inventario/disponibilidad/comercial`: `skus` separado por coma y `canal=MARKETPLACE`, scope contractual `inventario:disponibilidad:leer` (registro pendiente, operación provisional).
- Ambas peticiones usan `X-Correlation-Id` UUID. No se configura ni afirma un grant.

## Implementación y límites

- `g6-price.mapper.ts` adapta `Precio` al DTO F-012, calcula el descuento desde importes autoritativos y valida vigencia/moneda/SKU.
- `g6-availability.mapper.ts` ya proyecta los cuatro estados del contrato sin exponer saldos ni ubicaciones; `INDETERMINADO` no se convierte en agotado.
- `g6-commerce.adapter.ts` exige pin `0.7.0-rc.3`, aprobación global y una aprobación separada por operación antes de autorizar tráfico. Sus tests usan únicamente un servidor sintético en loopback y un bearer ficticio.
- El provider no está conectado a los servicios BFF. `ProductPriceService` y `ProductAvailabilityService` conservan 503 en modo REAL hasta cerrar I-01/homologación externa; no basta con poner una variable de entorno.
- Ninguna prueba pide token a G7, llama a G6, usa sandbox ni activa la reserva de inventario.

## Validación

```text
npm run test:g6:commerce-adapter:offline
```

La suite cubre fail-closed, proyección, correlación/auth local, 404, 403, JSON inválido y timeout. Es evidencia LOCAL/MOCK, no compatibilidad ni integración REAL.
