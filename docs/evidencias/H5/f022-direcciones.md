# F-022 · Operación y evidencia

| Fuente | Trazabilidad |
|---|---|
| Reglas y contrato | [Spec funcional](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/develop/SPECS/funcional/F-022-seleccionar-direccion-envio.md) · [OpenAPI del BFF](../../contratos/checkout-h4.openapi.yaml) · [OpenAPI de G7](https://github.com/Taller-SW-Web/Modulo-de-Seguridad/blob/main/specs/openapi.yaml) |
| Diseño V-010 | [Checkout](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=1-5) · [Móvil](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=390-2) · [Escritorio](https://www.figma.com/design/k6JZRdgbO7YtZXeFqygE8p/Mockups?node-id=236-1382) (enlaces de la spec V-010, aceptación visual pendiente) |
| Código y pruebas | [PR #331](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/331) · [Servicio](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/a7733f7/src/checkout/checkout.service.ts) · [Pruebas de fixtures](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/a7733f7/src/checkout/external/mock-http.adapter.spec.ts) · [E2E](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/blob/a7733f7/test/checkout.e2e-spec.ts) |

GET y POST `/api/v1/checkout/delivery-addresses` requieren JWT Bearer del titular. GET responde 200 y `{ data: [...] }`. Una lista vacía devuelve `{ data: [] }`. POST responde 201 y `{ data: address }`. Se envían calle, distrito, provincia, departamento y teléfono al BFF. Etiqueta y referencia son opcionales. No se admite un identificador de titular aportado por el cliente. El BFF usa el `sub` autenticado para la ruta de G7 y reenvía su token. G7 conserva las direcciones. Para cotizar, el BFF comprueba el `addressId` seleccionado contra la lista del titular. Un ID ausente de esa lista da `404 ADDRESS_NOT_FOUND`.

El OpenAPI de G7 no tiene campo de teléfono en Direccion. El BFF valida el campo del formulario y lo excluye de la llamada a G7 y de la respuesta. Acordar con G7 el tratamiento definitivo del dato antes de cerrar G-ADDRESS. El contacto para el pedido tiene su propio contrato.

| Error | Respuesta esperada |
|---|---|
| `400 ADDRESS_VALIDATION_ERROR` | Señalar los campos inválidos y conservar el formulario. |
| `401 UNAUTHENTICATED` | Solicitar una sesión válida. |
| `503 ADDRESS_SERVICE_UNAVAILABLE` | Conservar el formulario y detener el avance a cotización. Si falla un alta sin respuesta confirmada, volver a listar antes de repetirla. |

Configuración: `CHECKOUT_ADDRESS_SOURCE=fixture` con `USE_MOCKS=true` para fixtures locales. Para Prism usar `CHECKOUT_ADDRESS_SOURCE=prism` con `USE_MOCKS=true` y servir el OpenAPI de G7 en `localhost:4010`. La fuente `g7` requiere `AUTH_ENABLED=true`, `USE_MOCKS=false` y `G7_API_URL`. Activarla tras liberar G-ADDRESS.

- **MOCK, fixtures locales:** `npm run test:unit -- checkout` (54), `npm run test:e2e -- test/checkout.e2e-spec.ts test/combined-app.e2e-spec.ts test/openapi-contract.e2e-spec.ts` (39). Se probaron respuestas, aislamiento de titular, inputs inválidos, dirección ajena al cotizar, cobertura y timeout según los escenarios de checkout.
- **MOCK, Prism local:** desde el adaptador del PR #331, GET 200 y POST 201 con datos sintéticos y proyección de respuesta. Prism no acredita persistencia ni titularidad de G7.
- **REAL pendiente:** recorrido BFF↔G7 con entorno y cuentas de prueba autorizadas, SHAs, positivo, negativo y timeout controlado con evidencia sanitizada. Consulte [#115](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/115). La aceptación de QA y la revisión independiente siguen pendientes.
