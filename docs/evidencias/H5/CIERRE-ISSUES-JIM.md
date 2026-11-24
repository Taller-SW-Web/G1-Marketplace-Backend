# Cierre de issues de Jim · H5

Corte del 23/11/2026 (Lima), con la mini-ronda registrada el 24/11 a las 03:14 UTC. Las 27 issues de la tabla figuran abiertas en GitHub. Base documental: BE `develop` `170b5be` ([BE #343 aprobado][a343]), con [verificación local MOCK][develop] del SHA `d595caa`. Esta matriz propone cierres por criterio de cada issue. La preparación de un comentario no cambia su estado.

**5 cerrables hoy** · **1 tras revisión de Andrés** · **21 no cerrables**. La mini-ronda completó los casos pendientes de #25, #37 y #41. Las tres issues todavía tienen requisitos de homologación y revisión de G-AUTH.

## G7 REAL del 23/11

Ronda funcional autorizada por Brenis: **19 solicitudes del kit: 18 PASS, 1 FAIL y 4 SKIP, sin 429**. Ventana UTC `2026-11-23 21:53:07–21:55:48`. Kit `0d80b87`. Backend de G7 `05ad567d16d1323c1b13711aeb83f6ee5f041254`, confirmado por Brenis, no verificado por el kit. Evidencia resumida del reporte local sanitizado `REAL-2026-11-23T21-53-07.176Z-d6d8348c.json`; el archivo permanece ignorado por Git. Las rutas siguientes son relativas a `/api/v1`.

| Issue | UTC (23/11) | Evidencia REAL directa y límites |
|---|---|---|
| #25 | 21:53:07–21:54:00 | `/auth/registro` 201 y 409 `CORREO_NO_DISPONIBLE`; `/auth/verificar-correo` 410 `ENLACE_YA_USADO` (**FAIL**). Brenis informó que el enlace de C seguía sin consumir. Una confusión de tokens es hipótesis sin confirmar. Vencimiento 24 h: SKIP. |
| #29 | 21:54:00–21:54:23 | `/auth/login` 200 / 401 `CREDENCIALES_INVALIDAS` / 200 con desafío; `/auth/otp/solicitar` 202; `/auth/otp/verificar` 200; `/auth/logout` 204. |
| #33 | 21:54:24 | `/auth/logout` 204 y `/auth/refresh` 401 `REFRESCO_INVALIDO` para el refresh de la sesión cerrada. |
| #115 | 21:54:24 | `/usuarios/{id}/direcciones`: alta 201, lista propia 200 y lista ajena 403 `SCOPE_INSUFICIENTE`. Jim reportó el control previo manual de B (login, solicitud/verificación OTP, perfil, lista propia 200 y logout 204; seis HTTP fuera del kit, sin hora exacta en el JSON). |
| #37 | 21:54:25 | `/password/recuperar` 202 para cuenta conocida. Contraste con correo no registrado: SKIP. |
| #41 | 21:55:46–21:55:48 | `/password/restablecer` 204, reutilización 401 `TOKEN_RECUPERACION_INVALIDO`, `/auth/login` con clave nueva 200, `/auth/logout` 204. Recuperación vencida: SKIP. |

El cuarto SKIP de la ronda principal corresponde al timeout inducido, fuera de la autorización funcional. Se conservan sus conteos originales.

### Mini-ronda REAL · respuesta directa de G7

Fuente: salida de terminal de `mini-ronda.mjs` compartida por Jim. El script envió tres POST con `X-Request-Id`; no generó JSON. Brenis autorizó hasta cuatro solicitudes. Se usaron **3/4**, las tres dieron el resultado esperado y no hubo 429. Las trazas son identificadores de solicitud.

| Issue | UTC | Ruta relativa a `/api/v1` | HTTP y resultado | Traza `X-Request-Id` |
|---|---|---|---|---|
| #25 | 2026-11-24T03:14:49.348Z | POST `/auth/verificar-correo` | 204 PASS, enlace original de C sin reenvío | `504d751b-876d-4648-aa49-83f877859b87` |
| #41 | 2026-11-24T03:14:49.530Z | POST `/password/restablecer` | 410 `TOKEN_RECUPERACION_EXPIRADO` PASS, enlace de D de más de 30 min, sin usar ni reemplazar | `cccabb09-5de7-4442-8d4f-2b2a8a1e3dbc` |
| #37 | 2026-11-24T03:14:50.432Z | POST `/password/recuperar` | 202 PASS, con correo no registrado y el mismo estado HTTP que para la cuenta conocida | `094c91ce-126c-40e8-a87e-ce43fa43a248` |

La confirmación de C queda en PASS en el retest. El 410 `ENLACE_YA_USADO` anterior se conserva como fallo del primer intento. El posible pegado de un token de otro correo no fue confirmado por G7. Brenis informó que el enlace de C seguía sin consumir. El vencimiento de verificación de 24 h sigue sin ejecutarse en REAL.

Total de actividad G7 reportada: **28 solicitudes** (19 de la ronda principal, 6 del control manual de B y 3 de la mini-ronda). Hora avisada a Brenis: **22:20 Lima** del 23/11. Primera respuesta registrada a las **22:14:49 Lima**, cerca de seis minutos antes. Esta evidencia complementa la ronda principal y no acredita por sí sola G-AUTH, G-ADDRESS ni los recorridos con FE/BFF desplegados.

## Revisión escrita comprobada

- 23/11, 03:23–03:25 UTC: Andrés aprobó [BE #331][a331], [BE #338][a338], [FE #158][a158] y [FE #159][a159]. También constan en GitHub las aprobaciones de [BE #253][a253], [BE #333][a333], [BE #339][a339] y [FE #160][a160]. Cada comentario se limita al alcance del PR.
- También verifiqué fusiones y comentarios de Andrés en [BE #343][a343] (matriz y baseline), [FE #161][a161] (CSP) y [SPECS #20][a20] (su comentario describe CSP; el merge acredita que entró el acuerdo H-05, sin probar el receptor ni el intercambio del token).
- Para BE #332 solo observé un comentario de automatización y ninguna revisión de Andrés. Su CI sí está verde. La aprobación de BE #343 abarca la verificación local y la matriz, no una aprobación específica de BE #332.

## Decisión por issue

| Issue | Estado | Criterio | Evidencia al corte | Próximo paso y responsable |
|---|---|---|---|---|
| [BE #25](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/25) | **NO CERRABLE** | F-001 INT · confirmación y G-AUTH | REAL G7: alta 201, duplicado 409 y confirmación de C 204 en retest. El 410 anterior queda como fallo del primer intento. | Jim/G7 verifican vencimiento de 24 h, retorno de UI, timeout autorizado y recorrido desplegado. Andrés revisa G-AUTH. |
| [BE #26](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/26) | **NO CERRABLE** | F-001 QA · 409 neutro, canal/retorno, política y secretos | [E2E y DAST MOCK][qa26]; 409 directo REAL en la ronda. La revisión de #339 cubre el kit. | Jim y G7 contrastan neutralidad, política y exclusión de secretos del recorrido y logs autorizados; Andrés revisa esa evidencia. |
| [BE #29](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/29) | **NO CERRABLE** | F-002 INT · login/OTP, negativo y timeout bajo G-AUTH | 6/6 REAL directos a G7, incluida MFA. [Auth E2E MOCK][develop] y [revisión FE de cuenta][a159]. | Jim y G7 requieren prueba trazada BFF↔G7, renovación/retorno, timeout autorizado y decisión G-AUTH. Andrés revisa. |
| [BE #30](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/30) | **NO CERRABLE** | F-002 QA · JWT, MFA, retorno permitido, límites y almacenamiento | [Navegador MOCK][qa30], [DAST MOCK][a339], 401 y MFA funcionales en G7 REAL. | G7 y Jim acreditan expiración y límite efectivo en ventana autorizada; la ronda de 19 peticiones sin 429 no mide ese límite. Andrés revisa. |
| [BE #33](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/33) | **NO CERRABLE** | F-003 INT · cierre y revocación bajo G-AUTH | Logout 204 y refresh de la sesión cerrada 401 en G7 REAL. [Revisión de BE #253][a253] para sesión ilegible. | Jim/G7 prueban cierre BFF, caché, idempotencia y timeout autorizado. No se infiere revocación global. Andrés valida G-AUTH. |
| [BE #34](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/34) | **NO CERRABLE** | F-003 QA · revocación, cachés A/B, CSRF y refresh | [Navegador MOCK][qa34], [DAST MOCK][a339], 401 del refresh propio en G7 REAL. | Jim y G7 verifican cachés tras logout/cambio de cuenta en G1 con trazas reales y revisión de Andrés. |
| [BE #37](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/37) | **NO CERRABLE** | F-004 INT · entrega y 202 uniforme bajo G-AUTH | REAL G7: 202 para cuenta conocida en la ronda y 202 para correo no registrado en la mini-ronda. | Faltan recorrido BFF/UI desplegado, retorno y timeout autorizado con traza. Andrés revisa G-AUTH. |
| [BE #38](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/38) | **NO CERRABLE** | F-004 QA · neutralidad temporal, tasa y logs | [DAST y pruebas MOCK][qa38]; ambos 202 de G7 son REAL. | Jim/G7 aportan evidencia autorizada de latencia, límite efectivo y logs saneados. Dos 202 no demuestran paridad temporal. Andrés revisa. |
| [BE #41](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/41) | **NO CERRABLE** | F-005 INT · reset válido, usado y vencido bajo G-AUTH | REAL G7: reset, rechazo de reutilización, login con clave nueva, logout y 410 por enlace vencido sin usar. | Jim/G7 aún acreditan retorno y ausencia de sesión implícita en G1, timeout autorizado y gate G-AUTH. Andrés revisa. |
| [BE #42](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/42) | **NO CERRABLE** | F-005 QA · usado/vencido, referrer, analítica y sesión | [Entrada G1 y reset MOCK][qa42]; G7 API REAL rechaza tanto el enlace usado como el vencido. | G7 debe acreditar el comportamiento de su SPA (referrer, analítica y ausencia de sesión automática). Jim enlaza y Andrés revisa. |
| [BE #114](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/114) | **CERRABLE HOY** | F-022 BE · DTO, errores, titularidad con fixtures y sin persistencia | [BE #331][p331] fusionado; [aprobación de Andrés][a331], [operación](f022-direcciones.md) y [pruebas MOCK][e114]. | Este criterio de implementación usa fixtures. Mantener sin activar el adaptador REAL hasta G-ADDRESS (#115), con cotización aparte. |
| [BE #115](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/115) | **NO CERRABLE** | F-022 INT · BFF↔G7, positivos/negativos y timeout autorizados | G7 directo REAL: alta 201, lista 200 y 403 ajeno; control propio de B 200 manual. [BE #331 aprobado][a331]. | Jim/G7 deben activar y probar de forma autorizada el adaptador BFF, enlazar contrato/configuración, traza y timeout, y obtener revisión G-ADDRESS. Cotización queda MOCK. |
| [BE #116](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/116) | **NO CERRABLE** | F-022 QA · titular, cuerpo excluido, escaneos sin alto/crítico abierto | [BE #331][a331], [SAST/SCA/secretos][scans] y [DAST MOCK][qa116] aprobados en alcance indicado; 403 directo REAL. | La [constancia de QA][qa116] deja pendiente G-ADDRESS REAL. Jim/G7 deben contrastar el negativo con el BFF y sus logs/almacenamiento en entorno autorizado; Andrés revisa el cierre. |
| [BE #117](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/117) | **NO CERRABLE** | F-022 DOC · trazabilidad, operación y evidencia real | [Operación](f022-direcciones.md) fusionada y [revisada en BE #333][a333]. Prueba directa documentada aquí. | Jim enlaza evidencia BFF/FE desplegada y decisión G-ADDRESS de #115. El documento aprobado no da por terminada la integración. |
| [BE #223](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/223) | **NO CERRABLE** | Revisión gate H5 contra evidencia y arrastre a H6 | [BE #334][p334], revisión local `cdc7838` con fusiones y CI del corte. | Jim consolida resultado REAL y pendientes de este corte en la versión para revisar. Falta revisión del documento por Diego. |
| [BE #227](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/227) | **NO CERRABLE** | Revisión de gates, aportes Git, riesgo y alcance de release | [BE #335][p335], revisión local `c66b423` con baseline e inventario. | Jim/Diego validan el candidato y el alcance demostrado al congelar. Sigue pendiente revisión de gates y aceptación de riesgos. |
| [BE #294](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/294) | **TRAS REVISIÓN DE ANDRÉS** | Contract tests · positivos/negativos en CI y versión fijada | [BE #332][p332] fusionado, [CI auth/Prism][ci332] verde, [33/33 MOCK y versión G7 1.0.0][develop]. [#343 aprobado][a343] para matriz y baseline. | Falta aprobación escrita de Andrés sobre BE #332; no consta en comentarios ni revisiones. El criterio de contratos no requiere convertir los ejemplos a REAL. |
| [BE #313](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/313) | **NO CERRABLE** | RabbitMQ · acuerdo escrito y credenciales de prueba | Brenis comunicó acceso API; no acredita el broker. | G7 debe confirmar host/vhost, cola/publicador y entregar credenciales por canal seguro. Jim registra el acuerdo y Andrés revisa. |
| [BE #318](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/318) | **NO CERRABLE** | H-05 · acuerdo escrito y URL/token intercambiados en canal seguro | [SPECS #20][p20] fusionado con [comentario de Andrés][a20]. Ventas confirmó contrato y configuró URL/cabecera, según el seguimiento de Jim. | Falta constancia del intercambio seguro del token con Ventas. Saire (#319) debe desplegar el receptor y coordinar la prueba para el gate posterior; el despliegue no sustituye el intercambio. |
| [BE #322](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/322) | **NO CERRABLE** | Plantillas de correo · envío, respuesta y seguimiento hasta aplicar | Seguimiento de Jim registra ZIP enviado y respuesta de Brenis: verificación y recuperación integradas y probadas en local. | G7 debe confirmar despliegue; Jim verifica recepción en buzón de prueba y registra respuesta/resultado. No atribuir el estilo nuevo a los correos de la ronda sin prueba. |
| [BE #326](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/326) | **NO CERRABLE** | Guion y al menos un ensayo completo registrado | [BE #336][p336], guion local `0044be3`. E2E MOCK por tramo. | Jim registra ensayo completo con SHAs, resultados y enlaces; Andrés valida el acta. |
| [BE #327](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/327) | **NO CERRABLE** | Checklist firmado y etiqueta del candidato | [BE #337][p337], checklist local `afa876d` y baseline con CI. | Jim y Andrés fijan el candidato, documentan la firma y registran la etiqueta efectiva del congelamiento. |
| [BE #330](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/330) | **CERRABLE HOY** | Matriz de responsabilidades · commit en SPECS | [SPECS #18][p18] fusionado en `28b03f1`; [constancia de issue][e330]. | El criterio es Git/documental. No requiere una prueba HTTP, gate REAL ni revisión adicional de integración. |
| [FE #59](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/59) | **CERRABLE HOY** | F-022 FE · componentes/estado tipados y casos desktop/móvil | [FE #158][p158] fusionado, [aprobación de Andrés][a158] y [V-010 MOCK][v010]. | Cierra implementación FE. BFF↔G7 desplegado y G-ADDRESS quedan en BE #115. |
| [FE #60](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/60) | **NO CERRABLE** | F-022 QA funcional · estados, transición y pruebas etiquetadas | [8/8 E2E y 13 casos de componentes MOCK][v010]; [aprobación FE #158][a158]. | El [registro de QA][e60] deja pendiente el retest REAL etiquetado con FE/BFF/G7. Jim ejecuta alta/listado tras G-ADDRESS y Andrés revisa la corrida; cotización sigue MOCK. |
| [FE #148](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/148) | **CERRABLE HOY** | V-010 · validación en línea y capturas desktop/móvil | [Capturas MOCK][v010] y [aprobación expresa de vista/capturas/pruebas][a158]. | El criterio UX son las capturas. Titularidad REAL y prueba integrada corresponden a BE #115. |
| [FE #150](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/150) | **CERRABLE HOY** | V-001–V-004 · vistas de cuenta y capturas desktop/móvil | [Capturas/especificaciones MOCK][v0100], [FE #159][p159] y [aprobación de Andrés][a159]. | El alcance UX se revisó con DS-001. G-AUTH y la SPA de G7 REAL se acreditan por separado. |

Los [comentarios de cierre](comentarios-cierre.md) se prepararon solo para las candidatas de hoy. Conservar por separado la evidencia MOCK de CI/fixtures y las observaciones REAL de G7 directo.

[develop]: VERIFICACION-DEVELOP.md
[a331]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331#issuecomment-7090706907
[a338]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/338#issuecomment-7090711387
[a343]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/343#issuecomment-7115555963
[a253]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/253#issuecomment-7090717688
[a333]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/333#issuecomment-7090722016
[a339]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/339#issuecomment-7090725692
[a158]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158#issuecomment-7090730781
[a159]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159#issuecomment-7090735595
[a160]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/160#issuecomment-7090738585
[a161]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/161#issuecomment-7117527116
[a20]: https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/20#issuecomment-7117546819
[qa26]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/26#issuecomment-7072059835
[qa30]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/30#issuecomment-7072765806
[qa34]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/34#issuecomment-7072766084
[qa38]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/38#issuecomment-7072060651
[qa42]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/42#issuecomment-7072766404
[qa116]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/116#issuecomment-7072061237
[e114]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/114#issuecomment-7071599398
[e330]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/330#issuecomment-7071627771
[e60]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/60#issuecomment-7072765539
[scans]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975209207
[ci332]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/44975254262
[v010]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/10a1356c586ee8f009777d29efbde4075511d241/docs/evidencias/H5/V-010-direccion-envio/README.md
[v0100]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/blob/5bd2629d69d0116913828a260b729cc66cf6f36a/docs/evidencias/H5/UX-010-cuenta-V001-V004/README.md
[p331]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331
[p332]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/332
[p334]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/334
[p335]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/335
[p336]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/336
[p337]: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/337
[p158]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/158
[p159]: https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/pull/159
[p18]: https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/18
[p20]: https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/20
