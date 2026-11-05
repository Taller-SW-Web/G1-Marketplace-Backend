# F-037 — QA seguridad / DevSecOps

Fecha: 05/11/2026. Issue: [#183](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/183). PR: [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). Responsable: Diego Espinoza. Revisor solicitado: Fernando Saire (`saire22`).

## Corte verificable

El candidato evaluado es `bb32747f27c079a156ee5a952bc026a24658ed04`. El [workflow de sesión y seguridad](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/42084072315) se ejecutó sobre ese `headSha` y terminó correctamente. Su checkout interno analizó el merge ref `0feaf9eb11664cbd70f1640bf50f308185327be1` contra la base `3c6bc6c5755185f47eb13d98ed4bba80846f13e1`.

## Controles de fuga y titularidad

| Riesgo | Control y resultado |
|---|---|
| Favoritos de otra cuenta | Persistencia filtra por el `customerId` derivado de la sesión. La prueba A/B obtiene `ONLY-A` para A y `ONLY-B` para B. |
| Cambio de cuenta | Tras cerrar A e iniciar B, la lectura sólo devuelve los datos de B. El logout no elimina ni altera favoritos. |
| Identidad manipulada | `customerId` en query se rechaza con `400`; sesión ausente, expirada, revocada o Bearer forjado se rechaza con `401`. |
| Caché compartida | `GET /api/v1/wishlist` responde `Cache-Control: no-store, private`. |
| Datos sensibles | El DTO sólo permite `productId`, `createdAt`, `name`, `slug`, `brand`, `image`, `price` y `availability`; no expone identidad, tokens, cookies ni datos privados del proveedor. |
| G6 caído o malformado | Responde `503 CATALOG_UNAVAILABLE` con mensaje neutro; no devuelve colección parcial ni detalle privado del upstream. |
| Lista vacía | Devuelve `200 []` sin consultar G6. |

Fuentes: `test/auth-g7.e2e-spec.ts`, `test/wishlist-handoff.integration-spec.ts`, `src/wishlist/wishlist-read.service.ts`, `src/wishlist/wishlist.repository.ts` y `src/catalog/real-wishlist-catalog.ts`.

## Ejecución automatizada y scans

El job `auth-session` construyó la aplicación, creó un PostgreSQL 16 desechable, ejecutó las suites G7/Favoritos, typecheck y el gate de seguridad. Todos sus pasos terminaron en `success`.

Metadatos sanitizados del artefacto `h4-auth-bff-security`:

- Gitleaks 8.30.1: fuente, historial del PR y artefacto compilado sin hallazgos; control positivo aprobado.
- Semgrep 1.181.0: 191 archivos de `src` y `scripts`, cero hallazgos y cero errores; control positivo aprobado. Es un ruleset local y no certifica análisis interprocedimental completo.
- SCA runtime: 0 vulnerabilidades.
- SCA completo: 4 bajas, 17 moderadas, 0 altas y 0 críticas. Son dependencias de tooling de desarrollo.
- Inventario generado: 684 paquetes. Es inventario, no aprobación legal automática.

Los workflows adicionales del mismo SHA (`Backend PR validation`, `CI-CD` y verificación aislada H4) también finalizaron correctamente. El deploy fue omitido porque el evento fue `pull_request`.

## DAST aplicable

Se reutiliza el sondeo no destructivo documentado para el mismo lockfile y BFF público en [F036-QA-SEGURIDAD-2026-11-05.md](F036-QA-SEGURIDAD-2026-11-05.md): lectura anónima `401` con `no-store, private`, JSON malformado `400` sin eco, `TRACE` `405`, salud y readiness `200`.

Este sondeo acredita el destino observado, pero no el candidato: la URL pública no expone SHA y el workflow del PR no desplegó. Tampoco se usaron credenciales A/B externas. La prueba A/B sí está acreditada en CI con PostgreSQL e identidad controlados.

## Hallazgos y decisión

No queda hallazgo crítico/alto explotable abierto. Las dependencias moderadas/bajas son de desarrollo y se aceptan para este corte sin `audit fix --force`: las soluciones propuestas introducen cambios mayores o downgrade y el runtime está limpio.

La ausencia observada de HSTS, `X-Content-Type-Options`, `X-Frame-Options` y CSP en el BFF público se registra como endurecimiento de infraestructura. Para esta API autenticada y sin HTML no demuestra fuga entre cuentas ni un hallazgo alto/crítico; su propietario debe decidir si se aplica en proxy o aplicación.

## Estado de cierre

El trabajo controlable por G1 para #183 queda completo y listo para revisión independiente. No se requiere programación adicional conocida. Para acreditar gates globales quedan fuera de esta tarea:

- publicar o identificar un despliegue por SHA y ejecutar allí A/B con credenciales autorizadas;
- completar la homologación G6 REAL de #182;
- obtener la aprobación independiente solicitada a `saire22`.

Estos límites no invalidan los negativos locales ni los scans; impiden afirmar despliegue o integración REAL antes de que existan.
