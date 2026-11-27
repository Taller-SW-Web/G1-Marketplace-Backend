# Texto para solicitar revisión por WhatsApp

Texto preparado para Diego; no se ha enviado a ninguna persona. Las revisiones solicitadas son del avance local, no del cierre de integraciones reales.

```text
Hola, Fernando y Jim. Ya actualicé el backend de favoritos y CSAT con correcciones, más pruebas y documentación. La validación local suma 425 pruebas aprobadas; los servicios externos siguen simulados.

Fernando, ¿puedes revisar código, persistencia, pruebas y documentación local de estas issues?
• F-036, agregar favorito: #175, #176, #178 y #179.
• F-037, visualizar favoritos: #180, #181, #183 y #184.
• F-038, quitar/Deshacer: #185, #186, #188 y #189.
• F-039, agregar al carrito conservando favorito: #190, #191, #193 y #194.
• F-040, CSAT: #195, #196, #198 y #199. Revisar el código y las pruebas con dobles; G-PROMPT sigue pendiente.

Jim, ¿puedes revisar los borradores de seguimiento #208 y reestimación #219? Aún necesitan confirmaciones del equipo para cerrarse.

Código y pruebas: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/239
Seguimiento: https://github.com/Taller-SW-Web/G1-Marketplace-Backend/pull/240
Contrato F-039: https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/pull/15

Rama funcional: feat/diego-h4-favoritos-csat.
Rama de seguimiento: docs/diego-h4-seguimiento-issues.

Las issues #177, #182, #187, #192, #197 y #214 siguen en espera de validación con servicios reales. Por ahora solicito revisión del avance local; no cerrar integración/despliegue por estas pruebas. Si encuentran observaciones, déjenlas en el PR para corregirlas y volver a probar.
```
