# Evidencia de Mitigación de Arranque en Frío (Keep-Alive) — TASK-H5-PERF-007 (Issue #305)

**Responsable:** Andres Morales (`@andreus710`)  
**Revisor:** Leonidas Garcia (`@LeonidasGarcia`)  
**Fecha de medición:** 2026-11-23  
**Servicio propio evaluado:** `https://g1-marketplace-backend.onrender.com/health` (Render Free / Web Service)

---

## 1. Problema identificado
El plan de hosting gratuito en Render suspende el contenedor tras ~15 minutos de inactividad. Al llegar la primera petición de un usuario o de un smoke test, el contenedor debe iniciar desde cero (*cold start*), generando latencias superiores a 30 segundos y provocando timeouts en el BFF/Frontend o en pruebas automatizadas.

## 2. Solución implementada
- Se implementó el workflow programado [`.github/workflows/keep-alive.yml`](../../../.github/workflows/keep-alive.yml) en GitHub Actions con frecuencia `cron: '*/10 * * * *'` (cada 10 minutos) y disparador manual `workflow_dispatch`.
- El job sondea exclusivamente el endpoint propio `/health` del backend de G1 (sin generar tráfico sobre módulos de otros equipos), registra `http_code`, `time_starttransfer` (TTFB) y `time_total` en `$GITHUB_STEP_SUMMARY`, y cuenta con reintento controlado ante un eventual cold start.

## 3. Mediciones reales (Antes vs. Después)

Comando ejecutado contra `https://g1-marketplace-backend.onrender.com/health`:
```powershell
curl.exe -s -o NUL -w "HTTP %{http_code} | total=%{time_total}s | ttfb=%{time_starttransfer}s | connect=%{time_connect}s`n" --max-time 90 "https://g1-marketplace-backend.onrender.com/health"
```

| Escenario | HTTP Status | Connect | TTFB (`time_starttransfer`) | Tiempo total (`time_total`) | Mejora frente a cold start |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Antes (Cold start — instancia dormida)** | `200` | `0.122 s` | **`32.795 s`** | **`32.795 s`** | Línea base |
| **Después (Instancia caliente — muestra 1)** | `200` | `0.036 s` | **`0.262 s`** | **`0.262 s`** | **-99.2%** (~125x más rápido) |
| **Después (Instancia caliente — muestra 2)** | `200` | `0.024 s` | **`0.355 s`** | **`0.355 s`** | **-98.9%** (~92x más rápido) |

## 4. Conclusión y limitaciones
- Mantener la instancia activa mediante keep-alive reduce el tiempo de primera respuesta de **32.80 s** a **0.26–0.35 s** (promedio **0.31 s**), eliminando los timeouts iniciales en el catálogo y en el gateway Azure APIM.
- *Limitación conocida de GitHub Actions:* los eventos `schedule` en GitHub se ejecutan **únicamente desde la rama por defecto del repositorio (`main`)** y pueden experimentar jitter de algunos minutos en horas pico. Por ello, para completar el cierre operativo de `#305` se requiere promover `.github/workflows/keep-alive.yml` a `main` y verificar una ejecución `schedule` real además de `workflow_dispatch`.
