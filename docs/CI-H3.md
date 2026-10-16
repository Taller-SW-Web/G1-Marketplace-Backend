# Verificación H3

El workflow `.github/workflows/h3.yml` se ejecuta al push a `feat/s1-f006-f007-catalogo` o manualmente sobre esa rama. No despliega, no abre PR y no escribe main/develop. Usa `contents: read`, acciones fijadas por SHA, Node 22.18.0 y lockfiles. No necesita credenciales de Productos ni otras cuentas del grupo.

Backend ejecuta build, tipado, pruebas unitarias y HTTP, validación Prisma, migraciones sobre PostgreSQL 16 desechable y smoke del ejecutable compilado con readiness real. Ninguna migración apunta al entorno del equipo. Localmente el smoke usa una URL sintética sin BD y espera readiness 503.

Frontend ejecuta lint, componentes, build/E2E y tipado. Obtiene Backend público en una carpeta hermana por el SHA explícito del workflow. Usa Chromium en Linux y conserva Edge local; actualizar ese SHA requiere revisar el cambio y repetir pruebas. Los E2E usan MOCK, sin BD disponible ni conexión a G6. Las respuestas de error/vacío de casos específicos se interceptan deliberadamente desde el navegador; el recorrido normal pasa por Next y Nest compilados.

## Controles de seguridad

1. Semgrep CE **1.181.0**, cuatro reglas locales en `.security/semgrep.yml`: ejecución dinámica, sinks HTML, TLS deshabilitado y shell. Analiza `src` y `scripts`, con errores de análisis bloqueantes, métricas/version-check desactivados y sin reglas descargadas. Es un análisis inicial acotado; no certifica todos los riesgos OWASP ni flujo de datos entre archivos.
2. Gitleaks **8.30.1**, archivo oficial verificado con SHA-256 antes de extraer sólo el ejecutable. Escanea snapshot de archivos de Git, historial `base..HEAD` de esta entrega y artefacto de build (`dist` o `.next/static`). No incluye .env locales ignorados ni todo node_modules. Se deshabilitan comentarios de exclusión. Cada ejecución verifica un control positivo sintético temporal, al igual que Semgrep.
3. `npm audit --json` completo y `--omit=dev`: bloquea high/critical. Moderate/low siguen visibles y requieren dueño/aceptación humana; pasar el gate no significa riesgo aceptado. No ejecuta audit fix ni cambia dependencias del baseline.
4. Inventario de versiones/licencias de package-lock y package.json instalados. No sustituye revisión de compatibilidad legal. Las dependencias opcionales de otra plataforma pueden figurar UNKNOWN si no declaran licencia en lockfile y no están instaladas.

`scripts/security-check.py` captura resultados crudos sólo en un directorio temporal; el reporte publica campos permitidos (regla, archivo, línea, paquete/severidad y conteos), sin coincidencias, secretos, fragmentos de código ni email de autores. Los artefactos de CI tienen retención de **7 días**. Frontend incluye reporte Playwright de sesiones con fixtures sintéticos. No subir dumps, tokens o logs de entornos reales. Los fallos de herramienta no se convierten en cero hallazgos.

Las reglas y scripts de seguridad son copias deliberadas e idénticas en ambos repositorios para que cada rama sea ejecutable por separado. Si se cambia un control común, actualizar los dos y documentarlo en SPECS.

## Ejecución local

Después de `npm ci` y del build, usar un entorno Python independiente; instalar las herramientas fuera de las dependencias de la aplicación:

```powershell
py -3.13 -m venv .local-security/tools-python
& .local-security/tools-python/Scripts/python.exe -m pip install -r .security/requirements.txt
& .local-security/tools-python/Scripts/python.exe scripts/install-gitleaks.py
$env:H3_SEMGREP = (Resolve-Path .local-security/tools-python/Scripts/semgrep.exe).Path
$env:H3_GITLEAKS = (Resolve-Path .local-security/tools/gitleaks.exe).Path
```

En Backend:

```powershell
node scripts/smoke-h3.mjs
& .local-security/tools-python/Scripts/python.exe scripts/security-check.py --base ed9582e55da30007620d5740f9e4c80d41d5ad8b --artifact dist
```

En Frontend:

```powershell
& .local-security/tools-python/Scripts/python.exe scripts/security-check.py --base 0f47537ee12c25194817f7682be84500a62dde1c --artifact .next/static
```

Los reportes quedan en `.local-security/summary.json` y `licenses.json`, ignorados por Git. En Windows, Semgrep requiere acceso al almacén de certificados del sistema; un error de permisos/certificados debe resolverse en el entorno, sin desactivar TLS ni omitir el control. CI corre en Ubuntu.

No ejecutar el smoke contra un puerto ocupado (usa 10101), contra servicios externos ni con datos reales. La validación dinámica local es dirigida; **DAST baseline de staging sigue pendiente** hasta disponer de un entorno propio y autorización operativa. La integración REAL, revisión humana y aceptación H3 se registran separadamente en SPECS.

Fuentes de herramientas: [Semgrep CLI](https://docs.semgrep.dev/cli-reference), [Gitleaks v8.30.1](https://github.com/gitleaks/gitleaks/tree/v8.30.1), [artefactos de GitHub](https://github.com/actions/upload-artifact). La evidencia de cada ejecución y sus límites se registra en [SPECS](https://github.com/Taller-SW-Web/G1-Marketplace-SPECS/blob/docs/giuliano-elementos-compartidos/plan/evidencias/H3-AUTONOMIA-2026-10-16.md).
