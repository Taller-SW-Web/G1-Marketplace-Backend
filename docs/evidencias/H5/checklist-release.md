# Checklist del congelamiento H5 · Borrador

Fecha prevista 26/11/2026. Jim registra el candidato y Andrés revisa. Completar con referencias verificables de cada entorno.

- [ ] Fijar SHAs de frontend, backend y SPECS. Identificar la versión desplegada previa a la que se puede volver.
- [ ] Adjuntar CI/seguridad del candidato: lint, build, typecheck, pruebas, SAST/SCA/secretos y artefactos sanitizados.
- [ ] Registrar imagen o artefacto por digest, migraciones requeridas, plan de rollback y dueño de la ejecución.
- [ ] Verificar smoke en el entorno candidato: login, catálogo, carrito y tramos de checkout aprobados. Registrar fecha, entorno y SHA.
- [ ] Confirmar evidencias REAL autorizadas para cada gate declarado como integrado. Mantener G-ADDRESS y cualquier otro gate sin evidencia fuera del tramo REAL.
- [ ] Adjuntar reportes de rendimiento, pruebas de gateway y trazas de eventos cuando correspondan al alcance congelado. Enlazar excepciones con responsable y fecha.
- [ ] Adjuntar acta de al menos un ensayo completo [#326](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/326) y paquete de evidencias [#324](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/324).
- [ ] Registrar decisión de liberar o mantener la versión anterior. Validar firma/revisión del PO y Andrés.
- [ ] Registrar etiqueta y URL de release cuando el proceso habilitado las genere después de la aprobación.

Si falla una validación obligatoria o hay un hallazgo alto/crítico aplicable sin resolver, conservar la versión previa. Si un diagnóstico requiere revertir, recuperar el candidato anterior según el plan de despliegue y repetir smoke.

Campos por completar: SHAs y artefactos, URLs, riesgos aceptados, firmas, fecha efectiva y etiqueta.
