# Catálogo H4: perfil temporal de integración y objetivo G6 de cinco segundos

Decisión de preparación técnica de Giuliano, 03/11/2026: usar un perfil temporal de integración de 15 segundos hacia G6 y 18 segundos en Next, manteniendo documentado el objetivo de que G6 complete la respuesta en cinco segundos. No modifica entornos publicados ni acredita aceptación de G6 o del grupo.

| Perfil | BFF → G6 | Next → BFF | Comprobador externo | Objetivo de respuesta G6 |
| --- | --- | --- | --- | --- |
| `standard` | 5000 ms | 8000 ms | 11000 ms | 5000 ms |
| `integration` | 15000 ms | 18000 ms | 21000 ms | 5000 ms |

Los defaults existentes de la aplicación permanecen en 5/8 s. `scripts/catalog-h4/timings.mjs` define los perfiles para la preparación local. `--integration-budget` aplica 15/18 s a los procesos de la demo y 21 s a su comprobador. El margen superior permite recibir errores del nivel inferior en lugar de cortarlos antes. No convierte la latencia de 15 s en objetivo definitivo ni cambia secretos/configuración de producción.

## Medición del 03/11/2026, 16:41 Lima

Tres GET públicos sin JWT al catálogo de G6, una observación por operación, presupuesto 15 s. Se midió desde el inicio del cliente hasta completar el cuerpo de respuesta; no se retuvieron consultas ni payloads comerciales.

| Operación | HTTP | Tiempo observado | Dentro de 5 s | Dentro de 15 s |
| --- | --- | --- | --- | --- |
| Búsqueda | 200 | 5743 ms | No | Sí |
| Orden por nombre | 200 | 10824 ms | No | Sí |
| Segunda página | 200 | 10840 ms | No | Sí |

Son observaciones acotadas, no un p95 ni certificación de SLO. Un error rápido tampoco satisface el objetivo: el comprobador exige respuesta 200 completada para registrar éxito dentro del tiempo. La demo anónima no verifica permisos técnicos.

## Solicitud técnica para revisión con G6

Objetivo planteado por G1: las lecturas comerciales necesarias para catálogo deben entregar una respuesta correcta y completa en un máximo de **5000 ms**, medida desde el cliente G1 en el entorno acordado. G6 debe confirmar alcance, dataset, modo ordinario/demo, versiones y condiciones de medición antes de tratarlo como compromiso bilateral.

Para investigarlo: registrar SHA/configuración del Gateway y servicios, correlacionar las tres operaciones y medir consulta SQL, taxonomía, identidad y enriquecimiento de precios. El preview de Marketplace revisado en master enriquece candidatos antes de paginar con concurrencia acotada; es una hipótesis compatible con la diferencia de tiempos, no una causa demostrada sin trazas del despliegue. Evitar consultas internas repetidas y transmitir un deadline que deje margen al transporte.

El filtro monetario ordinario tiene su propia dependencia de Pricing e identidad interna. No sustituir el fallo con vacío ni filtrar sólo la página para aparentar una respuesta rápida.

## Reproducir

```powershell
npm run test:catalog:h4:timings
npm run measure:g6:h4 -- --public-demo --base-url https://g6-productos-ofertas.duckdns.org --profile integration --samples 1
```

`--public-demo` es una opción explícita de lecturas anónimas, no un mecanismo para activar producción. El script no obtiene/envía tokens ni cambia configuración remota. Permite entre una y tres muestras por operación; no es una prueba de carga. Mantener la prueba acotada al entorno autorizado.

Pendiente: aceptación G6 del objetivo, optimización/configuración que permita cumplirlo, medición repetible con datos conocidos e identidad real, y comprobación desde el corte desplegado de G1. El perfil temporal sólo facilita las pruebas mientras se resuelven esos puntos.
