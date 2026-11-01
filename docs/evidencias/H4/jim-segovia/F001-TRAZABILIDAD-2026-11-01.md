# F-001 registro — trazabilidad y operación (BE #27)

Corte: 01/11/2026. Este documento distingue contrato, implementación local y evidencia pendiente. No acredita integración G7, despliegue ni aprobación independiente.

## Fuentes y decisiones

- Specs G1: [funcional](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/funcional/F-001-registrar-cliente.md), [UI](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/ui/F-001-registrar-cliente.md), [API](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/contrato-api/F-001-registrar-cliente.md) y [React](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/componentes-react/F-001-registrar-cliente.md).
- Decisión A1 del contrato: Seguridad posee verificación, reenvío y enlaces vencidos/usados; G1 sólo registra y muestra `PENDIENTE_VERIFICACION`. El retorno a `/login` se configura en Seguridad. G1 no recibe el token ni envía `returnURL`.
- [Archivo de mockups de Figma](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups): el archivo y la página «Acceso y cuenta» están identificados en SPECS. **Falta comprobar el enlace al frame específico de registro**; el archivo general no se presenta como evidencia de aprobación visual.

## Matriz de criterios

| Criterio | Implementación G1 | Evidencia local / PR | Falta para cierre |
|---|---|---|---|
| CA-F001-01, un registro | FE `src/features/auth/RegistrationForm.tsx`; BE `src/auth/account.controller.ts`, `account.service.ts` | FE `tests/components/account-g7.test.tsx`; BE `test/account-g7.e2e-spec.ts` y [#245](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/245) | Ejecución con G7 desplegado y revisión |
| CA-F001-02, correo repetido | BE `src/auth/g7.client.ts` filtra mensajes externos; FE `src/features/auth/account-client.ts` muestra texto neutro | Negativos BE [#246](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/246); navegador FE [#114](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/114) | Resolver con G7/PO que `201` frente a `409` sigue distinguiendo existencia |
| CA-F001-03, canal y campos | BE `src/auth/account.dto.ts` limita el cuerpo y `account.service.ts` añade `MARKETPLACE` | `test/account-g7.e2e-spec.ts`; negativos de #245/#246 con doble | Inspeccionar petición real sanitizada en ambiente autorizado |
| CA-F001-04, pendiente sin sesión | FE `RegistrationAccepted` en `RegistrationForm.tsx`; BE `account.service.ts` proyecta sólo `id` y estado | `tests/auth/account-local.spec.ts`, `tests/server/account-g7.test.ts`; #245 | Correo/verificación y retorno reales; navegador desplegado |
| CA-F001-05, enlace/retorno | Propiedad de G7 según la decisión A1; G1 conserva `/login` y no procesa token de verificación | Contrato G1; no hay prueba real de enlaces válido, vencido o usado | Confirmar versión/URL G7, tres recorridos y retorno sin token |

Las rutas FE citadas pertenecen al repositorio Frontend; los PR aún requieren fusión. Los tests de #245/#246 usan un doble HTTP, y #114 usa rutas interceptadas en Chromium. Sus resultados no prueban la operación de G7.

## Operación y errores

`GET /api/v1/auth/capabilities` sólo anuncia registro si la sesión G7 está habilitada y `G7_REGISTRATION_ENABLED=true`. El valor inicial es apagado; no activarlo sin el gate externo. La UI también exige política vigente y URLs HTTPS de términos y privacidad publicadas (`G1_TERMS_URL`, `G1_PRIVACY_URL`). Su publicación y ratificación siguen pendientes.

El BFF acepta `201` sólo con UUID y `PENDIENTE_VERIFICACION`, sin crear sesión. `400 VALIDACION` rechaza campos extra o inválidos; `409 CORREO_NO_DISPONIBLE` y `422 POLITICA_INCUMPLIDA` conservan códigos contratados con mensajes acotados; respuesta de proveedor inesperada o timeout se proyecta como indisponibilidad. Revisar trazas sanitizadas sin correos, contraseñas ni tokens antes de atribuir un fallo a G7.

## Gates abiertos

Faltan: enlace directo al frame de Figma y aprobación visual; URLs legales publicadas; revisión de #245/#246/#114 y sus bases de dependencias; versión y despliegue exactos de G7; registro, verificación y retorno reales (válido/vencido/usado); SAST/SCA/DAST aplicables al corte final; revisión independiente de Andrés. Mantener #27 y las demás tareas F-001 abiertas hasta acreditar cada gate.
