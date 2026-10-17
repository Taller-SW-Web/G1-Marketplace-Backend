# Checklist backend — H3 / F-028 Historial de pedidos

> Guía de implementación para la rama `feat/h3-f028-historial-pedidos`. Alcance: BFF NestJS de Marketplace con fixture `MOCK` para el corte individual de H3; no equivale a integración I-03 ni a cierre de F-028.

## Base revisada

- [ ] Partir de `develop` del backend, actualmente migrado a NestJS + Prisma.
- [ ] Respetar módulos actuales (`AppModule`, `HealthModule`, `PrismaModule`), `ValidationPipe` global, filtro de 404, configuración validada y convenciones del proyecto.
- [ ] Revisar F-028 funcional, API, React, UI/V-015, plan y seguimiento en SPECS.
- [ ] Confirmar: `develop` tiene health/Prisma, pero todavía no módulo de pedidos ni integración de historial.

## Módulo de pedidos

- [ ] Añadir un módulo NestJS de pedidos/historial, separado del health check; no crear un servidor Express paralelo.
- [ ] Implementar endpoint Marketplace `GET /api/v1/orders/me` con Controller, DTO de query, servicio y proveedor/adaptador inyectable.
- [ ] Mantener `page` local desde cero y `pageSize` con valores/límites permitidos por el contrato; valor inicial `page=0&pageSize=10`.
- [ ] Validar parámetros con `class-validator`/`class-transformer` según el `ValidationPipe` global. Rechazar parámetros desconocidos como `clienteId`.
- [ ] Responder el DTO público acordado: `data` de resúmenes (`orderId`, `state`, `total.amount`, `total.currency`, `createdAt`) y `page` (`number`, `size`, `totalElements`, `totalPages`).
- [ ] Mantener los IDs de pedido opacos; no aceptar identificador del cliente para seleccionar historial.
- [ ] No añadir modelo/tabla Prisma para copiar pedidos: Ventas es la fuente de verdad.

## Proveedor MOCK para H3

- [ ] Implementar proveedor de fixture determinista detrás de una interfaz; habilitarlo sólo explícitamente en desarrollo/pruebas.
- [ ] La fixture usa únicamente clientes y pedidos sintéticos, sin PII ni secretos.
- [ ] La identidad de demostración es un principal sintético fijo configurado en servidor (`ORDERS_MOCK_CUSTOMER_ID`); no se puede elegir con header/query/body del cliente.
- [ ] Probar que parámetros como `clienteId` se rechazan y que el proveedor sólo proyecta pedidos del principal de servidor configurado. No llamar a Ventas en modo MOCK.
- [ ] Hacer que cero pedidos sea `200` con `data: []` y metadatos coherentes.
- [ ] Hacer que fallo del proveedor sea error recuperable; nunca traducir un fallo/timeout a una lista vacía.
- [ ] Prohibir fallback silencioso de REAL a MOCK. La evidencia y respuesta de desarrollo deben identificar MOCK claramente.

## Preparación para la integración futura (mantener bloqueada)

- [ ] Aislar el adaptador HTTP de Ventas de la lógica del controller/servicio.
- [ ] Cuando I-03 esté liberado, obtener identidad de JWT validado en el backend; derivar titular desde `sub`/`customerId` según contrato homologado.
- [ ] Enviar a Ventas `GET /api/v1/pedidos/me`, no una ruta con `clienteId`.
- [ ] Convertir página local 0 a página upstream 1 en el adaptador, no en frontend; mapear `items`, `total`, `page`, `pageSize` al contrato Marketplace.
- [ ] Añadir timeout, validación estricta de respuesta, correlación y errores públicos seguros antes de activar REAL.
- [ ] No configurar URL/token ni habilitar REAL hasta que exista aprobación, ambiente, scope y prueba autorizada registrados.
- [ ] Mantener separada la evidencia MOCK de las pruebas de integración reales.

## Seguridad y operación

- [ ] No aceptar ni confiar en `clienteId` del navegador; requests no deben permitir IDOR por query/header/body.
- [ ] No loguear bearer JWT, token de servicio, PII, cuerpos completos del proveedor ni errores crudos.
- [ ] Validar parámetros y proyección de salida antes de usar datos externos.
- [ ] No abrir CORS con `*`; para Next server-to-server, no ampliar CORS del navegador innecesariamente.
- [ ] Si una integración futura pasa por navegador, revisar allowlist de orígenes/headers con Andres y seguridad; no enviar credenciales de servicio al frontend.
- [ ] No cambiar health, Prisma o despliegue como sustituto del endpoint ni considerar `/health` evidencia de integración.

## Pruebas a preparar

- [ ] Controller/servicio: respuesta válida del titular fixture.
- [ ] Servicio/proveedor: pedidos de un principal sintético no aparecen al consultar con otro principal de configuración; el cliente no puede cambiar ese principal.
- [ ] API: `clienteId` y parámetros desconocidos son rechazados por el DTO/ValidationPipe.
- [ ] Paginación: `page=0` y `pageSize=10` se reflejan correctamente; conversión `0→1` se prueba en el adaptador aislado.
- [ ] Vacío: proveedor/fixture devuelve `200`, arreglo vacío y metadatos correctos.
- [ ] Fallo/timeout: devuelve error seguro, no `200` vacío, y no expone detalles internos.
- [ ] DTO: no se filtran campos privados adicionales del fixture/proveedor.
- [ ] Ejecutar y registrar comandos definidos en `package.json` (`npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`) según el alcance disponible. No registrar comandos no ejecutados.

## Evidencia y entrega

- [ ] Enlazar rama, commit, PR hacia `develop`, revisión de Jim y tarea `TASK-F028-BE-001`.
- [ ] Documentar módulo/ruta/DTO/servicio/proveedor y decisiones de diseño.
- [ ] Adjuntar comandos exactos, casos positivos/negativos, resultados y entorno.
- [ ] Incluir request/response sanitizados sin tokens ni PII y clasificación explícita `MOCK`.
- [ ] Explicar cualquier desviación de specs; mantener I-03 como pendiente mientras no haya prueba real aprobada.
- [ ] Escribir explícitamente: “BFF local con fixture MOCK y principal fijo de demostración; no valida JWT real ni acredita integración con Ventas”.
- [ ] No marcar integración, QA, seguridad o F-028 como terminadas por tener el endpoint fixture.

## Fuera de alcance H3

- [ ] No leer la base de datos de Ventas ni persistir pedidos en Prisma Marketplace.
- [ ] No implementar filtros F-029, detalle F-030, reorder F-031, tracking F-032 ni notificaciones F-033–F-035.
- [ ] No simular evidencia de proveedor real ni habilitar `I-03` sin contrato, ambiente, credenciales y prueba autorizada.

## Referencias

- `G1-Marketplace-SPECS/SPECS/funcional/F-028-historial-pedidos.md`
- `G1-Marketplace-SPECS/SPECS/contrato-api/F-028-historial-pedidos.md`
- `G1-Marketplace-SPECS/SPECS/componentes-react/F-028-historial-pedidos.md`
- `G1-Marketplace-SPECS/plan/funcionalidades/F-028-historial-pedidos.md`
- `G1-Marketplace-SPECS/plan/seguimiento/F-028-historial-pedidos.md`
