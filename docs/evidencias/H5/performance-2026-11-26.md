# Lighthouse móvil — despliegue del corte H5

**Medición:** 26 de noviembre de 2026, America/Lima.
**Despliegue medido:** `develop`, commit `93fdc79f9e2c52eee4ff29ac80f107c9e9b0821e`.
**Ejecución de despliegue:** [GitHub Actions #45766627066](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/actions/runs/45766627066), completada el 26/nov/2026 a las 01:12 (GMT-5).
**Destino:** [g1-marketplace-frontend.vercel.app](https://g1-marketplace-frontend.vercel.app/). La rama del PR #172 no estaba desplegada; las mediciones se hicieron sobre el alias desplegado de `develop`.

## Resultados

| Ruta | Hora de captura (GMT-5) | Rendimiento | Accesibilidad | Prácticas | SEO | Resultado ≥90 | Reporte móvil |
|---|---:|---:|---:|---:|---:|---|---|
| Inicio `/` | 16:31:32 | **81** | 100 | 96 | 100 | Parcial — 9 puntos bajo | [PageSpeed Insights](https://pagespeed.web.dev/analysis/https-g1-marketplace-frontend-vercel-app/gtr4r0abwawvhfqyjnwlwz?form_factor=mobile) |
| Catálogo `/catalogo` | 16:32:45 | **95** | 100 | 96 | 100 | Cumple | [PageSpeed Insights](https://pagespeed.web.dev/analysis/https-g1-marketplace-frontend-vercel-app-catalogo/lzx6mvkqay9qdtcprbayt4?form_factor=mobile) |
| Ficha `/productos/producto-demostracion-4` | 16:33:03 | **87** | 100 | 96 | 100 | Parcial — 3 puntos bajo | [PageSpeed Insights](https://pagespeed.web.dev/analysis/https-g1-marketplace-frontend-vercel-app-productos-producto-demostracion-4/m8ol5dpvnx3cuqewkb4djh?form_factor=mobile) |

## Entorno de medición

PageSpeed Insights con Lighthouse 13.6.0, emulación móvil Moto G Power y limitación de red 4G lenta. Cada ruta se ejecutó como una sola sesión/página. Las puntuaciones son una captura puntual y pueden variar entre ejecuciones; conservar cada enlace junto al SHA del despliegue al presentar el resultado.

**Conclusión para la exposición:** rendimiento parcial. Inicio quedó en 81 y ficha en 87, por debajo del umbral 90; catálogo quedó en 95 y cumple. Accesibilidad marcó 100 en las tres rutas.
