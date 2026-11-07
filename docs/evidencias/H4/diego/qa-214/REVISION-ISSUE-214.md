# QA individual de integración — issue #214

Fecha: 03/11/2026. Responsable QA: DiesmEsp. Revisor: Fernando Saire (`saire22`).

Issue: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/214. PR de trazabilidad: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239. Frontend relacionado: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118.

## Resultado y alcance

Se construyó una matriz de 40 funciones con 419 filas: 240 dimensiones mínimas de QA y 179 criterios literales extraídos de las specs funcionales/API/React/UI. Son casos y criterios a verificar, no 419 ejecuciones aprobadas. Los criterios repetidos entre capas se conservan con su fuente; no se convierten en conteo de funcionalidades.

La verificación transversal pertenece a #214. Los owners funcionales conservan implementación y correcciones; esta matriz no reasigna sus tareas a Diego. Las 25 funciones objetivo H4 son F-001–F-021/F-036–F-039; las otras 15 se incluyen para registrar preparación local y bloqueos, sin adelantar su cierre S3–S5.

**La issue permanece abierta.** No se confirmó un corte FE/BE listo para QA ni acceso A/B documentado para esta ejecución. No se realizaron login real, escrituras en servicios compartidos, pruebas externas de timeout ni operaciones con cuentas reales. Tampoco se acredita revisión de Fernando.

## Corrida local dirigida

| Corrida | Aprobadas | Fallidas | Omitidas | Origen |
|---|---:|---:|---:|---|
| backend-local | 58 | 0 | 0 | MOCK/controlado; no REAL |
| frontend-componentes | 50 | 0 | 0 | MOCK/controlado; no REAL |
| frontend-servidor | 71 | 0 | 0 | MOCK/controlado; no REAL |

Total: 179 pruebas dirigidas aprobadas. No son pruebas de las 40 funciones ni sustituyen las baterías de sus owners. No se repitió toda la suite histórica: esta corrida aporta resultados individuales trazables para la matriz que faltaba.

El primer intento no inició por restricciones del sandbox (SWC y caché de Vitest). Se repitió con autorización y las tres corridas finalizaron con salida 0. No se suman los intentos de arranque fallidos como pruebas funcionales. PostgreSQL y navegador conectados conservan su evidencia histórica del 03/11; no se presentan como reejecutados aquí.

| Candidato probado | SHA publicado | Archivos de código/tests/configuración contrastados | Diferencias |
|---|---|---:|---:|
| backend | `0f9761ff2daa17594f5669395ec0f4a0ffb8697e` | 161 | 0 |
| frontend | `1647c1ab24b9ae2f4377f83b7b2c61f3ee9a76c7` | 211 | 0 |

Se verificó identidad de archivos contra los objetos Git publicados, no contra un deployment. Las dependencias existentes se reutilizaron mediante junction; no se ejecutó instalación limpia. El catálogo/identidad/persistencia de estas pruebas son dobles; que una clase se llame RealWishlistCatalog no cambia el origen de su proveedor HTTP loopback.

### Evidencia local concreta

| Función | Cobertura local encontrada en la corrida | Límite pendiente |
|---|---|---|
| F-036 | Alta idempotente, rechazo de producto no elegible, identidad manipulada/vencida, sincronización de controles y fallo sin éxito falso | G6/G7 efectivos y UI desplegada |
| F-037 | Validación de colección/vacío, proyección, fallo de catálogo diferenciado de vacío, controles de acceso al proxy | No equivale a listado REAL A/B en despliegue |
| F-038 | Borrado idempotente, propietario ajeno, fallo/resultado incierto, Deshacer y restauración fallida | Homologación G-UNDO y flujo real completo |
| F-039 | Sesión opaca A/B en BFF controlado, opt-in, destino de variante, timeout sin reenvío y conservación del favorito | SPECS #15, contratos G6/cantidad y carrito real del titular |
| F-040 | 5/3/1, pedido ajeno/no entregado, prompt ausente, duplicado canónico y timeout conservando estado/borrador | I-03/I-04/G-PROMPT, motivos/política y Ventas REAL |

Las filas genéricas de vacío/A-B requieren decidir aplicabilidad por operación con Fernando. No se declaran “no aplica” de forma automática; lectura pública no implica ownership privado y una mutación no necesariamente tiene colección vacía.

## Inventario por función

Estados OPEN/CLOSED son administrativos y no certifican la cobertura de QA. Un PR merged tampoco demuestra el despliegue. Las evidencias del equipo que no se ejecutaron en esta corrida se mantienen por verificar, no se califican como fallidas o inexistentes.

| Función | Owner de implementación | Issues OPEN/CLOSED | Evidencia local de esta corrida | QA funcional/seguridad |
|---|---|---|---|---|
| [F-001](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-001-registrar-cliente.md) | JimSegovia | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/26) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/18) |
| [F-002](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-002-iniciar-sesion.md) | JimSegovia | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/30) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/20) |
| [F-003](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-003-cerrar-sesion.md) | JimSegovia | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/34) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/22) |
| [F-004](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-004-solicitar-recuperacion-password.md) | JimSegovia | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/38) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/24) |
| [F-005](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-005-restablecer-password.md) | JimSegovia | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/42) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/26) |
| [F-006](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-006-inicio-categorias-destacados.md) | GiulianoMaPe | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/46) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/28) |
| [F-007](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-007-buscar-productos-texto.md) | GiulianoMaPe | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/50) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/30) |
| [F-008](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-008-filtrar-catalogo.md) | GiulianoMaPe | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/54) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/32) |
| [F-009](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-009-ordenar-catalogo.md) | GiulianoMaPe | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/58) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/34) |
| [F-010](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-010-paginar-catalogo.md) | GiulianoMaPe | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/62) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/36) |
| [F-011](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-011-detalle-producto.md) | SebastianMalca | 4/2 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/66) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/38) |
| [F-012](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-012-precio-oferta-descuento.md) | SebastianMalca | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/70) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/40) |
| [F-013](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-013-seleccion-atributos-variante.md) | SebastianMalca | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/74) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/42) |
| [F-014](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-014-consultar-disponibilidad-stock.md) | SebastianMalca | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/78) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/44) |
| [F-015](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-015-productos-relacionados.md) | SebastianMalca | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/82) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/46) |
| [F-016](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-016-agregar-item-carrito.md) | andreus710 | 0/7 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/87) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/48) |
| [F-017](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-017-cambiar-cantidad-item-carrito.md) | andreus710 | 0/7 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/92) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/50) |
| [F-018](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-018-quitar-item-carrito.md) | andreus710 | 0/7 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/97) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/52) |
| [F-019](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-019-visualizar-carrito.md) | andreus710 | 0/7 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/102) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/54) |
| [F-020](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-020-fusionar-carrito-anonimo.md) | andreus710 | 0/7 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/107) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/56) |
| [F-021](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-021-mover-carrito-favoritos.md) | andreus710 | 0/7 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/112) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/58) |
| [F-022](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-022-seleccionar-direccion-envio.md) | LeonidasGarcia | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/116) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/60) |
| [F-023](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-023-calcular-resumen-envio.md) | LeonidasGarcia | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/120) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/62) |
| [F-024](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-024-validar-aplicar-cupon-promocion.md) | LeonidasGarcia | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/124) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/64) |
| [F-025](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-025-simular-pago-revalidar-stock.md) | LeonidasGarcia | 7/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/129) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/66) |
| [F-026](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-026-crear-orden-ventas.md) | LeonidasGarcia | 7/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/134) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/68) |
| [F-027](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-027-confirmacion-orden.md) | LeonidasGarcia | 7/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/139) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/70) |
| [F-028](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-028-historial-pedidos.md) | saire22 | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/143) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/72) |
| [F-029](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-029-filtrar-historial-pedidos.md) | saire22 | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/147) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/74) |
| [F-030](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-030-detalle-pedido.md) | saire22 | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/151) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/76) |
| [F-031](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-031-reordenar-compra.md) | saire22 | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/155) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/78) |
| [F-032](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-032-seguimiento-despacho.md) | saire22 | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/159) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/80) |
| [F-033](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-033-generar-plantilla-correo.md) | saire22 | 6/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/163) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/82) |
| [F-034](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-034-enviar-confirmacion-asincrona.md) | saire22 | 7/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/168) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/84) |
| [F-035](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-035-enviar-actualizacion-despacho.md) | saire22 | 7/0 | No reejecutada; verificar evidencia del owner | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/173) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/86) |
| [F-036](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-036-agregar-favorito.md) | DiesmEsp | 7/0 | Relacionada; ver ledger | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/178) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/88) |
| [F-037](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-037-visualizar-favoritos.md) | DiesmEsp | 7/0 | Relacionada; ver ledger | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/183) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/90) |
| [F-038](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-038-quitar-favorito.md) | DiesmEsp | 7/0 | Relacionada; ver ledger | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/188) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/92) |
| [F-039](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-039-mover-favorito-carrito.md) | DiesmEsp | 7/0 | Relacionada; ver ledger | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/193) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/94) |
| [F-040](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/46005a488bef751ba76d9496193eb2ddbb04453e/SPECS/funcional/F-040-evaluacion-postentrega.md) | DiesmEsp | 7/0 | Relacionada; ver ledger | [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/198) · [issue](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/96) |

## Contraste con PR existentes

`evidencia-pr.csv` conserva PR, SHA, estado y límites de la selección relacionada. Es una relación por alcance, no asociación nativa de Development ni cobertura exhaustiva de todas las revisiones del equipo.

| Función | PR relacionados | Lectura y límite |
|---|---|---|
| F-001 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/229) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/105) | Cuenta/sesión: implementación integrada; cada operación requiere su evidencia actual REAL/UI/API. |
| F-002 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/229) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/105) | Cuenta/sesión: implementación integrada; cada operación requiere su evidencia actual REAL/UI/API. |
| F-003 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/229) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/105) | Cuenta/sesión: implementación integrada; cada operación requiere su evidencia actual REAL/UI/API. |
| F-004 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/229) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/105) | Cuenta/sesión: implementación integrada; cada operación requiere su evidencia actual REAL/UI/API. |
| F-005 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/229) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/105) | Cuenta/sesión: implementación integrada; cada operación requiere su evidencia actual REAL/UI/API. |
| F-006 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/237) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/265) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/110) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/124) | Catálogo: mezcla de cambios integrados y propuestos; verificar origen REAL/MOCK por operación. |
| F-007 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/237) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/265) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/110) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/124) | Catálogo: mezcla de cambios integrados y propuestos; verificar origen REAL/MOCK por operación. |
| F-008 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/237) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/265) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/110) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/124) | Catálogo: mezcla de cambios integrados y propuestos; verificar origen REAL/MOCK por operación. |
| F-009 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/237) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/265) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/110) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/124) | Catálogo: mezcla de cambios integrados y propuestos; verificar origen REAL/MOCK por operación. |
| F-010 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/237) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/265) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/110) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/124) | Catálogo: mezcla de cambios integrados y propuestos; verificar origen REAL/MOCK por operación. |
| F-011 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/16) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/7) | Ficha inicial MOCK integrada; no certifica provider REAL. |
| F-012 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/232) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/266) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/107) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/125) | Región comercial/compatibilidad: propuestas abiertas; validar alcance específico de cada F. |
| F-013 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/232) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/266) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/107) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/125) | Región comercial/compatibilidad: propuestas abiertas; validar alcance específico de cada F. |
| F-014 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/232) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/266) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/107) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/125) | Región comercial/compatibilidad: propuestas abiertas; validar alcance específico de cada F. |
| F-015 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/232) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/266) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/107) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/125) | Región comercial/compatibilidad: propuestas abiertas; validar alcance específico de cada F. |
| F-016 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/13) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/5) | Carrito vertical inicial integrado; evidencia histórica no equivale a QA REAL del corte actual. |
| F-017 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/231) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/106) | Cantidad integrada; validar provider/cantidad y prueba desplegada. |
| F-018 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/255) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/117) | Borrado integrado; verificar Deshacer y evidencia completa por criterio. |
| F-019 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/256) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/119) | Carrito actual integrado; comprobar mismo titular y proyección del corte desplegado. |
| F-020 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/258) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/120) | Fusión integrada; contrastar concurrencia, titular y negativos con evidencia de owner. |
| F-021 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/260) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/121) | Movimiento carrito→favoritos integrado; validar fronteras y evidencia REAL sin asumir cierre desde merged. |
| F-022 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/233) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/236) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/108) | Componentes/contrato/pruebas integrados; adaptadores de checkout MOCK según evidencia revisada. |
| F-023 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/233) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/236) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/108) | Componentes/contrato/pruebas integrados; adaptadores de checkout MOCK según evidencia revisada. |
| F-024 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/233) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/236) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/108) | Componentes/contrato/pruebas integrados; adaptadores de checkout MOCK según evidencia revisada. |
| F-025 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/234) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/262) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/109) | Persistencia/pruebas integradas; el seguimiento de #262 reporta 40/40 PostgreSQL, proveedores MOCK. |
| F-026 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/235) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/109) | Creación/recuperación integradas y pruebas de persistencia; Ventas REAL sigue sin acreditar. |
| F-027 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/235) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/109) | Creación/recuperación integradas y pruebas de persistencia; Ventas REAL sigue sin acreditar. |
| F-028 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/14) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/6) | Historial MOCK integrado; el módulo publicado no habilita proveedor REAL. |
| F-029 | Por aportar por el owner | Sin PR específico identificado en la selección revisada. Solicitar al owner evidencia/ramas; no afirmar que no existe trabajo. |
| F-030 | Por aportar por el owner | Sin PR específico identificado en la selección revisada. Solicitar al owner evidencia/ramas; no afirmar que no existe trabajo. |
| F-031 | Por aportar por el owner | Sin PR específico identificado en la selección revisada. Solicitar al owner evidencia/ramas; no afirmar que no existe trabajo. |
| F-032 | Por aportar por el owner | Sin PR específico identificado en la selección revisada. Solicitar al owner evidencia/ramas; no afirmar que no existe trabajo. |
| F-033 | Por aportar por el owner | Sin PR específico identificado en la selección revisada. Solicitar al owner evidencia/ramas; no afirmar que no existe trabajo. |
| F-034 | Por aportar por el owner | Sin PR específico identificado en la selección revisada. Solicitar al owner evidencia/ramas; no afirmar que no existe trabajo. |
| F-035 | Por aportar por el owner | Sin PR específico identificado en la selección revisada. Solicitar al owner evidencia/ramas; no afirmar que no existe trabajo. |
| F-036 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118) | Candidatos propios en borrador, sin review Fernando; pruebas dirigidas locales verificadas en esta corrida. |
| F-037 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118) | Candidatos propios en borrador, sin review Fernando; pruebas dirigidas locales verificadas en esta corrida. |
| F-038 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118) | Candidatos propios en borrador, sin review Fernando; pruebas dirigidas locales verificadas en esta corrida. |
| F-039 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118) | Candidatos propios en borrador, sin review Fernando; pruebas dirigidas locales verificadas en esta corrida. |
| F-040 | [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239) · [PR](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/118) | Candidatos propios en borrador, sin review Fernando; pruebas dirigidas locales verificadas en esta corrida. |

## Bloqueos y siguiente ejecución

| ID | Falta | Quién aporta/resuelve | Salida verificable |
|---|---|---|---|
| B214-01 | Corte apto para QA | Owner de despliegue y responsables funcionales | URLs FE/BE, SHAs efectivos, deployment/run y declaración de qué operaciones están listas |
| B214-02 | Acceso y datos A/B | Responsable de identidad/datos y owner de cada función | Referencia al canal seguro de acceso, usuarios de prueba autorizados y dataset por operación; sin secretos en GitHub |
| B214-03 | Contratos y grants por ruta | Owner funcional e integración externa correspondiente | Provider/version, scopes/rutas, datos y limitaciones; no heredar permisos de otro cliente |
| B214-04 | Resultados del equipo por criterio | Cada owner; Diego verifica QA | Matriz con comando/caso/resultado, SHA/entorno/traza; separar provider directo de web desplegada |
| B214-05 | Discrepancia F-039 | Fernando/PO y responsables contractuales | Decisión aceptada de mover/conservar y specs FE/BE coherentes; SPECS #15 sigue como referencia propuesta |
| B214-06 | Prompt CSAT | Owner del contrato y Fernando/PO | I-03/I-04/G-PROMPT, motivos/política y fuente autoritativa aprobados; no crear endpoints sin acuerdo |
| B214-07 | Revisión independiente | Fernando; segundo revisor cuando participe en la evidencia | Revisión identificable por criterio, observaciones resueltas y aceptación del alcance/no aplicabilidades |

Orden: confirmar corte/acceso → verificar evidencia existente del owner → ejecutar lecturas públicas y casos disponibles → casos privados A/B con acceso autorizado → negativos/timeout en entorno controlado acordado → registrar hallazgos y retest → revisión. No hace falta esperar a que todos cierren; sólo se habilita cada caso cuando sus precondiciones están listas.

## Criterios de cierre

- [x] Matriz inicial de 40 funciones y criterios fuente preparada, sin atribuir cierre por planificación.
- [x] Corrida dirigida de pruebas locales con resultados individuales y candidatos identificados.
- [ ] Evidencia del resto del equipo contrastada por criterio, sin trasladar implementaciones a Diego.
- [ ] Corte FE/BE y acceso/datos/proveedores confirmados para las pruebas aplicables.
- [ ] Positivo/vacío/error/timeout y A/B completos por operación, con no aplicabilidades justificadas y revisadas.
- [ ] REAL/MOCK, provider/contrato/versiones, trazas y UI desplegada registrados por caso.
- [ ] Hallazgos corregidos y reprobados por sus owners; bloqueos restantes tratados según DoD.
- [ ] Revisión independiente de Fernando registrada; evitar autorrevisión en evidencia a la que contribuya.

## Archivos de evidencia y reproducción

- `matriz-casos.csv`/`.json`: cada dimensión y criterio literal, estado REAL y precondiciones pendientes.
- `matriz-funciones.csv`: owner, issues y fuentes de las 40 funciones.
- `evidencia-pr.csv`: metadatos y límites de los PR relacionados por función.
- `ejecuciones-locales.csv`/`.json`: nombre exacto de cada prueba aprobada, archivo y SHA publicado.
- `backend-local.json`, `frontend-componentes.json`, `frontend-servidor.json`: resultados brutos locales; revisar antes de compartir.
- `captura.json`, snapshots remotos y `identidad-candidatos.json`: fuentes/versiones y comprobación local.

Comandos de la corrida: backend `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand test/wishlist.e2e-spec.ts test/wishlist-g6.e2e-spec.ts test/csat.e2e-spec.ts`; frontend Vitest dirigido a `wishlist`, `favorites-list`, `favorites-controller`, `favorites-transport`, `csat`; servidor con `vitest.server.config.mts` para `favorites-cart-auth`, `favorites-cart`, `favorites-list`, `wishlist`. Los reportes JSON registran los archivos y resultados concretos.

Fuentes capturadas: 2026-11-03T22:52:52.116734+00:00; SPECS `46005a488bef751ba76d9496193eb2ddbb04453e`. Las capturas cubren 293 issues y 92 PR; estos totales son inventario consultado, no conteo de tareas de #214 ni cobertura validada.
