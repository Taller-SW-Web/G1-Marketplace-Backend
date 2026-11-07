## Evidencia H4 — 07/11/2026

F014: HTTP y navegador MOCK confirman el cuarto estado comercial con reintento y sin compra, separado del error técnico. Esta ejecución no implementa ni certifica el adaptador REAL de disponibilidad. SPECS #17 continúa sobre la base de #12, todavía borrador abierto hacia main.

Validado el 07/11/2026 (Lima), en copias aisladas de Backend develop `0a8041d` y Frontend develop `8420d42`, con Node 22.18.0. Son pruebas del código integrado posterior al merge, no de los HEAD históricos.

- Backend: build/tipos PASS; 574 unitarias y 368 HTTP PASS; 22 casos de BD omitidos. Cinco OpenAPI válidos.
- Frontend: build/tipos/lint PASS; 392 componentes/proxy, 81 servidor y 4 pruebas del runner PASS. Navegador: 41 catálogo/ficha/comercio y 5 destacados PASS (MOCK explícito). Se corrigió una espera del test de orden que leía tarjetas antes de su actualización; la aserción global sigue activa.
- Seguridad: secretos en fuente/historial/build, SAST y SCA cumplen los gates del proyecto en ambos repositorios. FE mantiene 10 entradas moderadas de herramientas de desarrollo; runtime sin vulnerabilidades detectadas. No equivale a DAST completo ni a aceptación humana de esos avisos.
- Gateway nuevo: los 50 enlaces/consultas obtuvieron 200 individualmente; primera pasada correcta 41/50 y nueve timeouts resueltos en retest. No prueba disponibilidad continua.
- Contrato G6/adaptador REAL: 25 PASS y 2 FAIL por 503 en filtros de precio. Next → BFF → G6: 21 PASS, 2 BLOCKED (precio), 2 INCONCLUSIVE (sin selección editorial/sin nombres iguales), 0 FAIL. No se cuentan bloques/inconclusos como aprobados.

Tres capturas REAL originales disponibles en el paquete de evidencia: Home con ocho categorías; Nike con cuatro tarjetas de siete productos; móvil con error recuperable de precio. Cero pageerrors en esos recorridos. No se presenta el frontend local como desplegado.

Archivos de evidencia de esta entrega: `docs/evidencias/H4/giuliano/2026-11-07/README.md`, JSON saneados, `screenshots/` y manifiesto SHA-256 en Backend. No se cerraron issues ni se fusionaron PR; permanecen aceptación independiente, ranking G5, dataset de empates y despliegue compartido.
