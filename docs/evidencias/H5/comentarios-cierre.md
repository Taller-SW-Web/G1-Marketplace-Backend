# Comentarios de cierre preparados · 23/11/2026

Textos para revisión de Jim. Horas UTC de los checks o del merge citado. Se registra HTTP únicamente cuando corresponde a un caso probado.

## BE #114 · Implementación F-022

Implementación y QA con fixtures **MOCK** de GET/POST `/api/v1/checkout/delivery-addresses`: lista 200, alta 201, sesión ausente 401, validación 400 y rechazo de identidad manipulable. El adaptador usa el token del titular y G1 no persiste la dirección. [Evidencia de los casos](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/114#issuecomment-7071599398). Revisión `8eaf882`, incluida en `a40429d`; [auth-session y escaneos](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975209207) verdes el **22/11 02:16:43 UTC**. [BE #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331) y [aprobación de Andrés](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331#issuecomment-7090706907).

El criterio de esta tarea pide validar la implementación con fixtures. La homologación BFF↔G7, el timeout autorizado y G-ADDRESS quedan en #115. Cotización sigue MOCK.

## BE #330 · Matriz de responsabilidades

La matriz incorpora el reparto aprobado y quedó en [SPECS #18](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/18), commit `a2634ac`, merge `28b03f1` del **22/11 02:11:50 UTC**. [Constancia de la tarea](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/330#issuecomment-7071627771). El criterio es el commit documental. No aplican ruta HTTP, código de respuesta ni etiqueta MOCK/REAL. La revisión de implementación o integración de las funciones reasignadas corresponde a sus issues.

## FE #59 · Implementación V-010

[FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158) implementó los componentes tipados del paso de dirección, sus estados y la selección tras el alta sin teléfono. [Evidencia MOCK](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/10a1356c586ee8f009777d29efbde4075511d241/docs/evidencias/H5/V-010-direccion-envio/README.md) en desktop y móvil: `/checkout/direccion` y fixtures de `/api/checkout/delivery-addresses` con GET 200, POST 201, validación 400 y sesión vencida 401. La UI no envía un identificador editable. [CI E2E](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45081960719) verde el **22/11 23:14:59 UTC**, SHA `878591d`, integrado en `10a1356`. [Aprobación escrita de Andrés](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158#issuecomment-7090730781).

El cierre es de implementación FE. La prueba BFF↔G7 desplegada y G-ADDRESS quedan en BE #115.

## FE #148 · Validación visual V-010

[Capturas desktop y móvil](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/10a1356c586ee8f009777d29efbde4075511d241/docs/evidencias/H5/V-010-direccion-envio/README.md) de validación en línea y estados de `/checkout/direccion`. Evidencia **MOCK**: GET 200 y POST 201 sin teléfono en `/api/checkout/delivery-addresses`, conservación de campos en 400 y sesión vencida 401. [FE #158](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158), SHA `878591d` integrado en `10a1356`; [CI E2E](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45081960719) verde el **22/11 23:14:59 UTC**. [Aprobación de Andrés sobre vista, capturas y pruebas](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158#issuecomment-7090730781).

Este cierre acredita la vista y sus capturas. La titularidad REAL desplegada se sigue en BE #115.

## FE #150 · Vistas de cuenta V-001 a V-004

[FE #159](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159) alineó las vistas de cuenta con DS-001. [Capturas desktop/móvil y 22 E2E locales MOCK](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/5bd2629d69d0116913828a260b729cc66cf6f36a/docs/evidencias/H5/UX-010-cuenta-V001-V004/README.md) con login 401 y registro 201/409 simulados sobre `/api/v1/auth/login` y `/api/v1/auth/registro`; V-003/V-004 comprobaron la entrada a recuperación y restablecimiento con un stub de la SPA. [CI E2E](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45079184957) verde el **22/11 22:44:33 UTC**, revisión `8f35cec`, integrada en `5bd2629`. [Aprobación escrita de Andrés](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159#issuecomment-7090735595).

Las capturas cierran el alcance UX. La SPA real, la entrega de correo y los gates G-AUTH quedan fuera de este cierre.
