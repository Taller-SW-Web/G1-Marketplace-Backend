# Reestimación condicionada S03–S05 — #219 — 03/11/2026

La implementación y QA local de F-036–F-040 tiene resultados actuales; no se estima reconstruir lo ya probado. F-039 incorpora conexión autenticada local. Los siete E2E conectados son con proveedores controlados, no prueba REAL.

| Bloque restante | Esfuerzo propio preliminar | Dependencia y salida |
|---|---|---|
| Alinear F-039 y revisión funcional | 0.5–1 día, más correcciones si aparecen | Fernando/PO aceptan semántica y revisor registra resultado |
| Homologar favoritos con G6/G7 y web desplegada | 1–2 días efectivos, excluye espera | URLs/SHAs, contratos/grants/datos A/B y positivo/negativo/vacío/timeout autorizados |
| CSAT REAL y ciclo prompt | No estimable hasta contrato; preparar casos propios ya es posible | I-03/I-04/G-PROMPT: autoridad, lectura/show/dismiss, motivos, política y Ventas/G5 |
| QA checkout/eventos #102/#103 | 1–2 días efectivos una vez disponible el sistema | F-034 y F-032/F-035 con eventos/datos y entorno autorizados |
| Cierre documental y verificación final | 0.5–1 día más revisión | Evidencias por criterio, DAST aplicable y aceptación de revisores |

Son estimaciones propuestas de trabajo de Diego, no compromisos del equipo ni cambio de semanas académicas. No se comprometen fechas calendario sin capacidad y disponibilidad confirmadas. El calendario H5/H6 depende de esas liberaciones; revisar después de cada gate y ante hallazgos.

## Confirmaciones pendientes

- Evento I-05: la documentación cita Ventas y webhook pedidos.envio.estado_actualizado v1.0.0; falta confirmar emisor/receptor, transporte/auth, entrega, retry y deduplicación con los responsables.
- Carga: no hay autorización concreta de URL, owner, ventana, RPS/concurrencia/duración, datos sintéticos, umbrales y parada. #219 pide confirmarla; no autoriza por sí sola ejecutar carga.
- Equipo: capacidad y fechas por entregable aún sin confirmación. Mantener responsables del plan; no absorber sus implementaciones.
- Revisión de Jim pendiente. #219 sigue abierta hasta confirmar y aceptar lo anterior.
