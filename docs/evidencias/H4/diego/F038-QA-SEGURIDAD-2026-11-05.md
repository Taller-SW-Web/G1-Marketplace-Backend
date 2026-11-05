# F-038 — QA seguridad / DevSecOps

Fecha: 05/11/2026. Issue: [#188](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/188). PR: [#239](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239). Responsable: Diego Espinoza. Revisor pendiente: Fernando Saire (`saire22`).

## Alcance y corte

El corte de código verificado parte del HEAD `fccf4b4d6093b90145e7bf8e091b0b5535c11768` del PR #239. Antes de este incremento documental, los jobs Backend PR validation (Node 22/24), CI-CD, sesión G7 y verificación aislada finalizaron correctamente. El deploy fue omitido por tratarse de un pull request.

La ejecución cubre los negativos atribuibles al backend en entorno local controlado y un sondeo público no autenticado y no destructivo. La URL pública no identifica su SHA, por lo que el sondeo no se atribuye al HEAD del PR ni acredita despliegue.

## Pruebas dirigidas ejecutadas

| Comando | Resultado |
|---|---|
| `npx jest --config ./test/jest-e2e.json --runInBand test/wishlist.e2e-spec.ts` | **31/31 PASS** |
| `npx jest --runInBand src/wishlist/wishlist.service.spec.ts src/wishlist/wishlist-read.service.spec.ts` | **10/10 PASS** |
| `npm run typecheck` | **PASS** |

Los casos relevantes verifican:

- DELETE de un usuario B no elimina el favorito del usuario A.
- Query/body con `customerId` o campos adicionales se rechaza antes de tocar persistencia.
- Identificadores inválidos se rechazan y un fallo interno no filtra la cadena de conexión.
- Tokens ausentes, alterados, vencidos, de issuer/audience/algoritmo/subject incorrectos o sin expiración no producen escrituras.
- El preflight sólo refleja el origen configurado; un origen ajeno no recibe `Access-Control-Allow-Origin`.
- DELETE es idempotente y no consulta elegibilidad; Undo se implementa como una nueva alta que revalida elegibilidad.
- Undo de un producto retirado falla cerrado; al restaurar uno activo se crea una fila nueva con una fecha posterior.

Las pruebas usan JWT y proveedores controlados. No se presentan como cuentas G7/G6 reales ni como DAST autenticado.

## SCA y secretos

| Control | Resultado |
|---|---|
| `npm audit --json --omit=dev` | **0 vulnerabilidades runtime** |
| `npm audit --json` | **4 bajas, 17 moderadas, 0 altas, 0 críticas** |
| Gitleaks 8.30.1 sobre fuente | **sin secretos** |
| Gitleaks 8.30.1 sobre 175 commits | **sin secretos** |

Los hallazgos completos pertenecen a herramientas de desarrollo y sus transitivas. No se ejecutó `audit fix --force`: las propuestas incluyen cambios mayores o downgrades. La aceptación de las moderadas continúa a cargo del revisor.

El SAST del corte permanece cubierto por los controles versionados y los checks del PR. Semgrep no está instalado en esta estación; no se atribuye una nueva ejecución local de Semgrep a esta evidencia.

## Sondeo público no destructivo

Destino: `https://g1-marketplace-backend.onrender.com`, alrededor de `2026-11-05T22:54:29Z`.

| Caso | Resultado |
|---|---|
| DELETE anónimo con origen ajeno | `401 UNAUTHORIZED`, `Cache-Control: no-store, private` |
| DELETE anónimo con identificador inválido | `401 UNAUTHORIZED`; la autenticación precede al tratamiento del recurso |
| Preflight DELETE con origen ajeno | `204`, sin `Access-Control-Allow-Origin`; el navegador no recibe autorización CORS |

Las respuestas incluyeron `X-Request-Id`. No se enviaron cookies, tokens ni una mutación autenticada, por lo que el sondeo no pudo modificar favoritos.

## Decisión de preparación para revisión

La evidencia local, SCA, secretos y sondeo seguro son suficientes para solicitar revisión independiente de #188. La issue no se declara terminada ni integrada.

Pendientes posteriores a la revisión:

- identificar el SHA desplegado y repetir los casos sobre ese deployment;
- ejecutar con cuentas autorizadas A/B los negativos de titular, CSRF de sesión y Undo con producto G6 no elegible;
- realizar DAST autenticado únicamente en staging propio/autorizado;
- aceptar o corregir los riesgos moderados y registrar hallazgos/retest;
- obtener la aprobación independiente de Fernando Saire.
