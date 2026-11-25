# Evidencia G6 pública para Wishlist — 2026-11-06

> Evidencia histórica del sondeo público inicial. Fue superada el 06/11/2026 por la entrega del contrato de comercio `0.6.0-rc.3`; véase [G6-COMMERCE-CONTRACT-RC3-2026-11-06.md](G6-COMMERCE-CONTRACT-RC3-2026-11-06.md). Sus resultados HTTP originales se conservan sin reescribir.

## Corte observado

- Fecha: `2026-11-06 10:33` (America/Lima), antes del apagado anunciado para las 13:00.
- Origen: `https://g6-po-axl031-167090a.chilecentral.cloudapp.azure.com/`.
- Transporte: HTTPS, solicitudes `GET`, sin cabecera `Authorization`, sin cookies y sin mutaciones.
- Esta evidencia acredita disponibilidad y contrato observado; no equivale por sí sola a homologación bilateral ni despliegue de G1.

## Resultados reales sanitizados

| Operación | Resultado | Evidencia relevante |
| --- | --- | --- |
| `GET /health` | `200` | `status=ok`, `service=api-gateway` |
| `GET /api/v1/categorias` | `200` | 8 categorías activas; correlación G6 `9f248219-ee5a-4855-b047-4cb5a73fb474` |
| `GET /api/v1/marcas` | `200` | 6 marcas activas; correlación G6 `71cef099-167b-45f7-bb49-dcea304deb08` |
| `GET /api/v1/productos?canal=MARKETPLACE` | `200` | 20 productos publicados, página 1/20; correlación G6 `f030208e-2d33-4c71-961f-52bb69e13019` |
| Detalle por UUID inexistente | `404` | `PRODUCTO_NO_ENCONTRADO`; correlación `036cc773-248f-441d-84b5-03e3d2c18b9b` |
| Detalle por slug inexistente | `404` | `PRODUCTO_NO_ENCONTRADO`; correlación `18d95ed2-fa8c-45b8-95e4-bda98d751897` |
| Detalle por ID publicado | `200` | `2ee6399e-2333-5916-847b-f6d2a0f03527`, producto simple, SKU `NIK-ACADEMY-HV4386-05`; correlación `620295ae-416e-46e4-ad12-42dca511d073` |
| Detalle por slug publicado | `200` | `nike-academy-hv4386-100`, mismo producto; correlación `2bf4ac2e-fa9b-4978-9583-38f946ba4290` |

El anuncio inicial indicaba `items: []`; el sondeo posterior devolvió 20 productos. La evidencia registra el estado efectivamente observado y no asume permanencia después del apagado.

El adaptador de esta rama también se ejecutó contra el detalle publicado y devolvió `PASS`, ID coincidente y SKU `NIK-ACADEMY-HV4386-05` con `authMode=public-read-only`. La salida sanitizada declara `authorizationSent=false`; este control está además cubierto por una prueba que inspecciona las opciones entregadas a `fetch`.

## Decisión de integración

- F-036 puede validar elegibilidad real por ID y ejecutar alta/idempotencia en G1.
- F-038 puede ejecutar DELETE local y revalidar elegibilidad real al deshacer.
- F-037 sólo dispone de identidad, marca, slug e imagen. No se publicaron precio ni disponibilidad comercial; G1 falla cerrado y no inventa esos valores.
- F-039 continúa cerrada: no se publicaron precio por SKU, disponibilidad de cantidad, operación `POST` de verificación ni `fulfillment_ref` autorizado.

## Controles implementados

- `PRODUCTOS_AUTH_MODE=public-read-only` omite `Authorization`, incluso si existe un token residual.
- La allowlist permite exclusivamente los `GET` públicos de Catálogo/Taxonomía.
- Pricing, Inventory y cualquier `POST` se rechazan localmente antes de invocar G6.
- Se mantienen HTTPS, rechazo de redirecciones, `credentials=omit`, `cache=no-store`, correlación UUID y timeout máximo de 5 s.
- El modo autenticado anterior continúa disponible mediante `service-token`; no hay cambio automático entre modos.

## Reproducción segura del adaptador

```powershell
npm run check:wishlist:g6 -- --base-url https://g6-po-axl031-167090a.chilecentral.cloudapp.azure.com/ --product-id 2ee6399e-2333-5916-847b-f6d2a0f03527
```

La salida contiene únicamente estado, ID, SKU público, modo y alcance. No imprime cuerpos de error, variables de entorno ni credenciales.

## Validación local del corte

- `npm run build`: PASS.
- `npm run typecheck`: PASS.
- Suite unitaria completa: 46 suites, 557 pruebas, PASS.
- Unitarias seleccionadas de adaptador, lectura y carrito Wishlist: 3 suites, 19 pruebas, PASS.
- E2E/contrato Wishlist seleccionadas: 2 suites, 35 pruebas, PASS.
- Adaptador contra G6 público: PASS para el producto y SKU indicados.
- La suite E2E completa no inició todas sus suites porque el entorno local no tenía `DATABASE_URL`; falló durante la validación de configuración, no en una aserción de Wishlist. No se usa ese intento como evidencia aprobada.

Las pruebas locales de Pricing/Inventory utilizan proveedores controlados y no se presentan como homologación real. La ventana pública sólo acredita Catálogo.

## Segundo corte y capturas de cierre

Se repitió el sondeo a las `2026-11-06T11:28:52-05:00`, antes del límite de las 13:00 de Perú. Health y detalle respondieron HTTP 200; el adaptador volvió a devolver `PASS` sin `Authorization`.

Resultados y capturas: [azure-2026-11-06/RESULTADOS.md](azure-2026-11-06/RESULTADOS.md).
