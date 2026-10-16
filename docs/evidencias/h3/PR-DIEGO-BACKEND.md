# Título propuesto

feat(favoritos): implementar agregar y quitar favoritos para el sandbox H3

## Descripción propuesta

El backend no tenía operaciones de favoritos. Este corte agrega POST y DELETE de F-036/F-038 sobre la base NestJS de develop, con Prisma/PostgreSQL, validación y aislamiento por cliente. Repetir POST devuelve el registro existente sin duplicarlo; DELETE solo modifica favoritos del titular y es idempotente.

Identidad y elegibilidad son adaptadores MOCK explícitos de sandbox. Se impiden en producción y no acreditan integración con Seguridad/Productos. Sin adaptador real, las rutas protegidas fallan cerradas. No incluye UI ni listado F-037.

Validación local: build, typecheck, lint TypeScript, Prisma validate, 22 unitarias, 36 HTTP y 5 de integración PostgreSQL 16. Se verifica concurrencia de diez POST, persistencia tras reinicio y aislamiento A/B. Audit de producción: cero alertas al corte. Ver evidencia y logs para el resultado final.

Cambios compartidos: configuración/CORS, health mínimo sin conteos y scripts; se conserva compatibilidad Render y rutas de salud de la base. Las precisiones contractuales están registradas en docs/contratos/h3-favoritos.md y pendientes de revisión.

Referencias: TASK-F036-BE-001, TASK-F038-BE-001 y DB/QA/DOC relacionados; plan raíz, docs/H3-DIEGO-USO.md, docs/evidencias/h3/diego-backend.md. Revisores: Fernando principal; Leonidas/Andres para contratos/seguridad. Integraciones y revisión humana pendientes.

Este archivo es un borrador local. No se creó ni publicó un PR.
