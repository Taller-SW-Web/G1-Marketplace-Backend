# Cierre de calidad contra Azure G6

Ejecución: `2026-11-06T11:28:52-05:00`, antes del límite de las 13:00 de Perú.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| `GET /health` | HTTP 200 en 0.279 s; `status=ok`, `service=api-gateway` |
| `GET /api/v1/productos/{id}?canal=MARKETPLACE` | HTTP 200 en 0.825 s |
| Identidad del producto | `2ee6399e-2333-5916-847b-f6d2a0f03527`, `Nike Academy` |
| SKU simple | `NIK-ACADEMY-HV4386-05` |
| Adaptador `RealWishlistCatalog` | `PASS` |
| Modo | `public-read-only` |
| Cabecera `Authorization` | No enviada |
| Alcance acreditado | Elegibilidad de Catálogo para F-036/F-038 |

Comando del adaptador:

```powershell
npm run check:wishlist:g6 -- --base-url https://g6-po-axl031-167090a.chilecentral.cloudapp.azure.com/ --product-id 2ee6399e-2333-5916-847b-f6d2a0f03527
```

## Capturas

- [Health de Azure](01-health.png)
- [Listado Marketplace publicado](02-productos.png)
- [Detalle positivo por ID](03-producto-detalle.png)
- [Resumen visual de ejecución](04-resumen.png)

Las capturas contienen exclusivamente respuestas públicas GET. No contienen JWT, cookies, secretos ni datos personales. Pricing, Inventory, verificación de cantidad y fulfillment no forman parte del acceso público y no se probaron como si estuvieran homologados.
