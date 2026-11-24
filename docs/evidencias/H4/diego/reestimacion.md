# Reestimación preliminar S03–S05 — #219

28/10/2026. Responsable Diego; revisión Jim Segovia pendiente. Se preservan responsables y semanas académicas de las issues; no se convierten a fechas de calendario sin disponibilidad acordada.

## Trabajo propio y secuencia

Implementación local de favoritos/CSAT y pruebas automatizadas preparada. No se estima como trabajo pendiente construir nuevamente lo ya probado. Restan bloques de revisión de una o dos sesiones:

1. Fernando revisa F-039 (conservar) y el paquete de favoritos; corregir/retest de hallazgos antes de aceptación.
2. Con G7/G6 disponibles: homologar grants, referencia de fulfillment y revisiones desplegadas; ejecutar casos REAL y después FE/BFF desplegados. Si falla una frontera, dejar sólo esa frontera pendiente.
3. Acordar autoridad y transporte del ciclo prompt; después revisar CSAT y probar Ventas/Postventa reales. No generar filas SHOWN en nube como sustituto del contrato.
4. Jim revisa matriz 40 F, capacidad declarada por cada responsable y esta reestimación; distribuir H5/H6 según gates y evidencia, sin duplicar conteo de avances H4.

Estas son unidades de revisión, no compromisos de calendario. Tiempo de proveedores, hallazgos y revisión humana no se conocen todavía.

## Riesgos y decisiones externas

| Frente | Riesgo / evidencia faltante | Acción y responsable |
|---|---|---|
| G7/G6 | Pruebas locales no certifican grants, despliegue o identidad A/B efectiva | Responsables de auth/catálogo y Diego registran versiones, entorno, datos autorizados y trazas; Fernando revisa. |
| I-05 eventos | Fuente publicada en SPECS: Ventas, webhook pedidos.envio.estado_actualizado v1.0.0. Entrega/auth/retry/deduplicación no quedan confirmados por publicar el contrato | Confirmar owner emisor/receptor y mecanismo con responsables de Ventas/notificaciones antes de semana 14; Jim/Diego registran. No se contactó a terceros en este corte. |
| I-06 | Credencial/scopes de Despacho requieren prueba por entorno | Registrar grant y casos por operación; no inferir permiso desde Seguridad. |
| I-04/G-PROMPT | No existe contrato completo para producir SHOWN/DISMISSED | Mantener flags CSAT apagados hasta acuerdo y revisión independiente. |
| Carga | No existe autorización concreta de destino, volumen o ventana en este corte | Registrar URL/owner, ventana, concurrencia/RPS/duración, dataset sintético, umbrales y condición de parada antes de ejecutar. No se hicieron pruebas de carga externas. |
| H5/H6 | No hay capacidad/estimación actual del resto del equipo | Revisar por entregable y semanalmente; conservar alcance demostrado y pendientes visibles. |

Estado: documento preparado; #219 conserva cierre pendiente de confirmaciones y revisión de Jim.
