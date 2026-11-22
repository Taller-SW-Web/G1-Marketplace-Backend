# Guion de ensayo H5 · Borrador

Ensayo previsto antes del congelamiento del 26/11. Presentación el 28/11. Jim conduce y Andrés verifica el recorrido. Preparar dos cuentas sintéticas, un SKU de prueba y una dirección ficticia. Definir entorno y SHAs para cada tramo. Mantener tokens y datos de sesión fuera de pantalla y del registro.

| Tiempo | Acción | Resultado visible |
|---|---|---|
| 0–1 min | Presentar candidato, entorno y leyenda REAL/MOCK. | Los enlaces del paquete [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324) abren y corresponden al candidato. |
| 1–3 min | Iniciar sesión, navegar al catálogo, abrir producto y añadir SKU a carrito. | Se ve la sesión y la línea del carrito. Registrar origen de datos de catálogo. |
| 3–5 min | En el ambiente MOCK autorizado, listar y crear una dirección ficticia, seleccionarla y avanzar a cotización. Provocar una respuesta de indisponibilidad con fixture y verificar que se conserva el formulario. | Se distingue la lista propia y el estado recuperable. La cotización se presenta como MOCK. |
| 5–8 min | Mostrar CI/CD y seguridad. Mostrar performance, gateway y evento solo si los responsables adjuntaron la evidencia del candidato. | Run, reporte o traza enlazados con su SHA. Para un flujo de compra, distinguir `CREADO` y `PAGADO` según la evidencia disponible. |
| 8–9 min | Mostrar gates abiertos, responsables y próximos pasos. | Se identifica qué queda pendiente de H6 y dónde se sigue. |

Si un servicio falla, registrar el paso y mostrar la evidencia del último run identificada con su fecha. Marcar el tramo pendiente de retest.

Para ensayar V-010 con fixtures de UI, usar [FE #158 en `182e4d3307c5a0adc8fa10415c22bbe8d054c957`](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/tree/182e4d3307c5a0adc8fa10415c22bbe8d054c957), con `CHECKOUT_MODE=local-fixtures` y `NEXT_PUBLIC_CHECKOUT_MODE=local-fixtures`. Abrir `/checkout/direccion`. La lista, el alta y la cotización de esa variante son **MOCK**.

Tras alinear FE #158 con el contrato sin teléfono del BFF, repetir con las revisiones FE y BE del candidato y guardar sus SHAs en el acta. [G-ADDRESS #115](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/115) debe homologar en G7 **solo el alta y el listado de direcciones del titular**. La cotización sigue **MOCK** y se demuestra por separado en la variante con fixtures.

## Acta del ensayo

- Fecha, asistentes, entorno y SHAs FE/BE: pendiente.
- Resultado por tramo y etiqueta REAL/MOCK: pendiente.
- Enlaces a evidencia sanitizada, incidencias y retest: pendiente.
- Revisión de Andrés: pendiente.
