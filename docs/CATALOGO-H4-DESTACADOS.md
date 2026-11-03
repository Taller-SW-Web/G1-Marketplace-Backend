# F-006: propuesta editorial de destacados de G1

Preparación técnica autorizada por Giuliano el 03/11/2026. La selección real, su responsable editorial y su aprobación de grupo siguen pendientes. No libera G-FEATURED, I-01 ni despliegue.

## Configuración y autoridad

La selección reside en configuración del servidor G1, como lista ordenada de IDs. G6 conserva la autoridad de nombre, slug, categoría, marca, imágenes y elegibilidad comercial. No se inventan tarjetas ni se escanea un listado incompleto para buscar esos IDs.

| Variable | Predeterminado | Efecto |
| --- | --- | --- |
| `CATALOG_FEATURED_ENABLED` | Desactivado salvo `true` explícito | Habilita la propuesta de composición |
| `CATALOG_FEATURED_APPROVED` | Desactivado salvo `true` explícito | Requisito adicional para REAL; representa una aprobación que debe obtenerse antes de activar |
| `CATALOG_FEATURED_IDS` | Vacío | IDs en orden editorial, separados por coma |

MOCK admite IDs sintéticos de sus fixtures con ENABLED; no requiere simular aprobación del grupo. REAL requiere ambos flags, además de los controles existentes de integración, contrato, origen e identidad. Una selección no aprobada no provoca consultas de productos y mantiene `featuredProducts: []`.

Límites técnicos de esta propuesta: máximo ocho IDs, sin repetidos, hasta tres lecturas simultáneas y un presupuesto compartido para toda Home. El presupuesto no se multiplica por el número de tarjetas. Son límites de implementación para revisión, no una nueva política comercial aceptada por el grupo.

## Operación y errores

Se consume `GET /api/v1/productos/{productoId}?canal=MARKETPLACE`, scope `catalogo:leer`. La operación ya aparece en el [OpenAPI rc1 fijado por G1](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-docs/blob/c36bd9a18f4fdb188df0d7e5158a431cf4b4ea7b/contratos/http/openapi.yaml), blob Git `f64bfe9a097b2a0f74c2600988305443d92f640e`. Su presencia se verificó contra ese blob; no se cambió el pin a rc3 ni se atribuyó un nuevo endpoint al owner.

- La identidad devuelta debe corresponder al ID pedido.
- Un 404 con `PRODUCTO_NO_ENCONTRADO` confirma ausencia y permite omitir la tarjeta.
- Se omiten estados conocidos inactivos y slug no publicable conforme a F-006.
- Un 401/403/429/503, un 404 con otro significado, una identidad distinta o datos malformados siguen siendo error técnico, no una Home vacía exitosa.
- Una imagen ausente o arreglo vacío produce `image: null`; una imagen insegura/presente fuera de allowlist no se oculta mediante placeholder.
- Sólo se proyectan `productId`, `slug`, `name`, `categoryId`, `brandId`, `image`. No se devuelven variantes, credenciales ni campos administrativos.
- Las solicitudes de G6 usan la identidad del servidor y correlación UUID. No se reenvía el bearer del visitante.

El código actual G6 que respalda la lectura comercial se revisó en [CatalogQueryController](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/blob/fa468e16cc3ed1a9de52ff7c8169cdc0598c0164/apps/catalog-svc/src/catalog-query.controller.ts), [CommercialService](https://github.com/Taller-SW-Web/G6-Productos-Ofertas-backend/blob/fa468e16cc3ed1a9de52ff7c8169cdc0598c0164/apps/catalog-svc/src/commercial.service.ts) y su repositorio. Esto no demuestra el SHA desplegado ni un grant G7.

## Demostración

En la copia Frontend, con Backend como directorio hermano:

```powershell
npm run demo:catalogo:featured -- --check --matrix --integration-budget
```

La demo usa `mock-product-3,mock-product-1`, mantiene APPROVED en `false`, etiqueta datos MOCK y no escribe en una base de datos. Para revisión visual se puede omitir `--check`; Ctrl+C detiene los procesos creados por la demo. `--skip-build` sirve cuando ambos builds ya corresponden al código actual.

El frontend comparte únicamente las lecturas simultáneas de Home del encabezado y la página. No conserva respuestas ya completadas: una visita posterior solicita datos nuevos. Cancelar un consumidor no cancela el de los demás; si no queda ninguno, se cancela el transporte.

## Pendiente de aceptación

Seleccionar IDs reales, responsable/mantenimiento editorial y política aceptada para selección vacía. Obtener aprobación y credenciales/grants, activar únicamente en el entorno acordado, revisar la entrega y probar el SHA desplegado. La demo sintética no acredita esos pasos.
