# Comprobación repetible de F-006–F-010

El runner hace sólo GET contra el BFF público de G1, directamente o mediante Next. No envía tokens/cookies, no llama G6 desde el navegador y no realiza mutaciones. Cada caso conserva estado, fuente, correlación y tiempo, sin retener consultas o cuerpos de respuesta.

## Ejecutar

```powershell
npm run test:catalog:h4:checks
npm run check:catalog:h4 -- --base-url http://127.0.0.1:3500 --via-web --source MOCK --query running --timeout-ms 21000 --output .local-security/catalog-h4-local.json
npm run check:catalog:h4 -- --base-url https://g1-marketplace-frontend.vercel.app --via-web --source REAL --query Nike --timeout-ms 21000 --output .local-security/catalog-h4-public.json
```

Los orígenes remotos requieren HTTPS; HTTP sólo se acepta en loopback. No se admiten credenciales, query o ruta en el origen. Para probar otro entorno, debe ser el autorizado por su responsable. Los reportes se guardan en `.local-security`, ignorado por Git. El proceso sale con 0 (PASS), 2 (PARTIAL) o 1 (FAIL).

| Estado | Interpretación |
| --- | --- |
| PASS | El caso verificable cumplió sus comprobaciones en esa observación |
| BLOCKED | No pudo ejecutarse por servicio/ruta/lectura o dependencia indisponible |
| INCONCLUSIVE | Falta dataset suficiente, cambió el catálogo entre lecturas o no se observó el caso necesario |
| FAIL | La respuesta contradice el contrato o una propiedad comprobable |

El runner continúa casos independientes aunque otro falle. Un 503/404 no se convierte en vacío exitoso. Un header REAL no verifica el grant, la configuración upstream ni el SHA desplegado. Un conjunto completo de PASS tampoco sustituye la aceptación del grupo.

## Casos y alcance

| F | Casos | Comprobaciones |
| --- | --- | --- |
| F-006 | 3 | Home pública, datos/duplicados, presencia observada de selección editorial y rechazo de query |
| F-007 | 4 | Búsqueda positiva, búsqueda vacía y límites 1/121 caracteres |
| F-008 | 7 | Maestros, categoría, combinación con rango/orden, protocolo de precio y tres negativos |
| F-009 | 4 | Ambos órdenes, empates visibles y enum inválido |
| F-010 | 7 | Primera/siguiente/última/fuera de rango, duplicados y tres límites inválidos |

Se comprueban proyección de tarjetas, metadatos y número de ítems, no-store y correlación. La elegibilidad monetaria global no puede demostrarse sólo con este DTO de tarjeta, que no expone precio. El orden de nombres depende de la colación del owner: no se inventa una colación JavaScript para certificar SQL. Los empates de nombres iguales sí permiten comprobar ID ascendente observado; sin ellos se informa INCONCLUSIVE.

El runner no controla la UI, inyecta timeouts, ejecuta DAST ni prueba reservas/compras. Los contratos HTTP locales y Playwright cubren sus partes específicas, con fuente MOCK/doble claramente declarada.

## Resultados del corte 03/11/2026

- Demo editorial Next/BFF MOCK: **24 PASS, 0 FAIL, 0 BLOCKED, 1 INCONCLUSIVE** por no observar nombres iguales en la muestra. El fixture controlado de orden prueba ambos sentidos y empates entre páginas por separado.
- Web pública de G1: **10 PASS de validación, 0 FAIL, 15 BLOCKED**. Home/búsqueda siguen 503; filtros 404. No demuestra cierre REAL.
- Regresión de navegador local: **30 casos de catálogo y cinco de destacados PASS** con Edge. Favorito anónimo usa fixture de sesión; catálogo/selección fluyen por HTTP Next/BFF MOCK.

## Comprobar configuración privada sin imprimirla

```powershell
npm run build
npm run test:catalog:h4:config
npm run check:catalog:config
# Si el operador necesita cargar explícitamente un archivo privado local:
node --env-file=.env scripts/catalog-h4/config.mjs
```

Se invoca el constructor real del proveedor con un transporte que no puede hacer HTTP. Sólo informa fuente, aceptación del constructor, presencia de ajustes y flags, coincidencia de pin y presupuesto numérico. No imprime URL/credencial/IDs ni autentica el token. El operador del despliegue debe ejecutarlo con la configuración efectiva de ese entorno; la salida local no diagnostica por sí sola las variables de Vercel/Render.

## Revisión de cierre

Relacionar reporte con SHAs/configuración, aportar request/response REAL saneados y revisión independiente. Mantener separados datos sintéticos, lecturas públicas sin JWT, grant técnico y despliegue. Los informes privados de la raíz no son artefactos de publicación.
