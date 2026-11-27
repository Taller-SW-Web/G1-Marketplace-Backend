# F-023 — Resumen de compra y envío: trazabilidad y evidencia local

**Corte:** rama documental `task-f023-doc-001-calcular-y-mostrar-resumen-de`, base evaluada `f17896d7ee24876ffd33db1bb7dd91d65623ed37` (2026-11-26). Esta ficha registra evidencia local; no acredita integración REAL ni despliegue.

## Fuentes de alcance y diseño

- [Seguimiento F-023](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/main/plan/seguimiento/F-023-calcular-resumen-envio.md), que enlaza especificaciones funcional, API, UI y React.
- Especificaciones funcional/API/UI/React y visualización V-011 referenciadas desde ese seguimiento.
- [Canvas Checkout, Figma](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=1-5&p=f&t=PXeKrikbDjSdUQ5l-0): referencia visual; no se declara revisión/aprobación visual independiente.
- Implementación BE: [PR #236](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/236), mergeada; parte F-023 de F-022–F-024.
- Pruebas negativas locales: [PR #270](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/270), mergeada; su alcance es F-022–F-025, no modifica runtime.
- FE: [PR #108](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/108), referenciada en la matriz de QA como implementación F-022–F-024; no se revalidó en este corte.

## Relación entre criterios y evidencia

| Criterio / riesgo | Evidencia en backend | Límite |
|---|---|---|
| Cotización ligada a dirección y versión/líneas autoritativas del carrito | `src/checkout/checkout.service.spec.ts`; creación condicionada a dirección propia y versión vigente | Prueba local con dobles; no demuestra I-01/I-06 REAL. |
| Rechazar una respuesta del proveedor que no corresponde al snapshot y preservar la cotización activa | `src/checkout/checkout.service.spec.ts` | No invoca Despacho REAL. |
| No aceptar una cotización vencida; cotización aislada por titular | `src/checkout/checkout.service.spec.ts`, `src/checkout/quotes.service.spec.ts` | No acredita persistencia compartida ni comportamiento en despliegue. |
| Coste/plazo no se presentan como gratuidad ante fallo | Rechazo seguro de respuesta incoherente; pruebas negativas de checkout documentadas en [evidencia de seguridad local](checkout-f022-f025-security-local.md) | Verificar el mapeo/copy de UI con QA Frontend; no afirmar validación visual. |
| Una respuesta tardía no debe reemplazar otra cotización, incluso con ID reutilizado | `src/checkout/checkout.service.spec.ts` | Prueba de concurrencia local, sin proveedor real. |
| Contrato HTTP, autenticación/ownership y errores | `test/checkout.e2e-spec.ts` (alcance de PR #236); pruebas de regresión de checkout | Evidencia histórica de PR; el comando de esta ficha no volvió a ejecutar E2E. |

## Ejecución reproducible en este corte

- `npm run test:unit -- --runTestsByPath src/checkout/checkout.service.spec.ts src/checkout/quotes.service.spec.ts src/checkout/external/mock-http.adapter.spec.ts` — **3 suites, 54 pruebas aprobadas**.
- `npm run typecheck` — **aprobado**.
- Configuración: worktree local, Node/npm del entorno, dobles/fixtures; sin llamadas a APIs externas ni servicios compartidos.
- SHA de base evaluada: `f17896d7ee24876ffd33db1bb7dd91d65623ed37`. La ficha se agrega en la rama de documentación; sus cambios aún no tienen SHA de commit.

## Decisiones y estado de gates

- El cliente no es autoridad de importes, líneas del carrito ni coste/plazo de envío; la cotización debe corresponder al snapshot y dirección vigentes.
- Fallo, expiración o contexto incoherente no equivale a envío gratuito ni autoriza preparar checkout con cotización vencida.
- Adaptadores/pruebas locales MOCK no prueban I-01/I-06 ni el snapshot conjunto autoritativo de FE+BE.
- [INT #119](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/119), [QA Backend #120](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/120) y [QA Frontend #62](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/62) continúan siendo gates separados. La integración REAL, timeout autorizado, revisión independiente y despliegue probado no están acreditados por esta ejecución.
- La evidencia existente documenta implementación y regresiones locales. No se declara terminada la función ni cerrados los gates por el hecho de que las PR estén mergeadas.

## Revisión

Revisión independiente de esta ficha y cotejo con las fuentes vigentes: **pendiente**. Registrar revisor, comentario/hallazgos y retest cuando ocurran; no inferir aprobación de revisiones históricas de otras PR.
