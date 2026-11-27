# Validación H4 de Giuliano — 07/11/2026, Lima

## Resultado

El código integrado F006–F010 supera las pruebas locales ejecutadas. La integración REAL es parcial: búsqueda, categorías, marcas, orden y paginación funcionan; los filtros de precio siguen recibiendo 503 de G6. No procede cerrar todas las issues por estos resultados.

## Revisiones y entorno

- Backend develop: `0a8041d08340ea8975de89dcb8ace45e4932e458` (1.8.2).
- Frontend develop: `8420d42855c9894267d6f06f8474834955d9b61e` (1.3.2).
- Node 22.18.0 instalado localmente; Linux, Chromium del sistema, procesos de prueba locales. Base de datos deliberadamente desconectada; no se probaron flujos de persistencia real.
- SPECS: rama de PR #16; enlaces comparados con `a8f3e6b38757b2d0dbc8965d5be4226c106e077b`.
- Origen REAL: `https://api-gateway.calmgrass-aec0b33c.chilecentral.azurecontainerapps.io`.
- Ensayo local Next 3540 → BFF 10640 → G6, `public-read-only`, TLS verificado, sin JWT/cookies y sin sustitución de HTTP. NODE_ENV=test en BFF, build de producción de Next. Destacados/ranking REAL desactivados.
- Las PR originales de código están fusionadas; esta ejecución corresponde a develop con aportes posteriores, no a sus HEAD históricos.

## Pruebas ejecutadas

| Frente | Resultado |
|---|---|
| BE build / tipos | PASS |
| BE unitarias | 45 suites, 574 PASS |
| BE HTTP | 24 suites, 368 PASS; 2 suites / 22 casos omitidos por requisitos de BD |
| BE herramientas | probe G6 6, matriz H4 8, configuración 4, presupuestos 3, emisor sintético 4: PASS |
| BE nuevo --base-url | 6 negativos PASS; rechaza HTTP, credenciales, ruta, query, fragmento y origen no canónico |
| OpenAPI | 5 contratos válidos |
| FE componentes/proxy | 392 PASS |
| FE servidor | 81 PASS |
| FE build / tipos / lint | PASS; comprobación final de tipos/lint tras corregir la prueba |
| FE política de secretos de Next | 5 PASS |
| FE runner de demo | 4 PASS; son pruebas del runner, no validación REAL por sí mismas |
| Navegador catálogo/filtros/orden/paginación/errores/ficha/comercio | 41 PASS después de corregir la sincronización del test |
| Navegador destacados | 5 PASS, MOCK explícito |
| SPECS | 20 Markdown, 156 destinos locales, 0 faltantes; diff --check PASS |
| Seguridad BE y FE | controles de secretos (fuente, historial y build), controles positivos, SAST y SCA PASS según gates del proyecto |

El primer navegador terminó 40 PASS / 1 FAIL: el test de orden leía `allTextContents` inmediatamente tras selectOption, antes de recibir/renderizar el catálogo ordenado. La corrección espera la respuesta de cada página y comprueba los títulos renderizados antes de comparar el orden global. No modifica el producto. Se conserva el informe inicial `browser-mock-initial.json` y la ejecución posterior completa.

SAST usa las cuatro reglas locales del proyecto; no certifica análisis de flujo entre archivos. SCA no encontró altas/críticas ni vulnerabilidades runtime. Frontend conserva 10 entradas moderadas de herramientas de desarrollo (familia ESLint/typescript-eslint/minimatch); requieren revisión/actualización o aceptación humana. El inventario de licencias no equivale a aprobación legal. No se ejecutó DAST completo con escáner ni prueba autenticada contra producción.

## Gateway y recorrido REAL

Los 50 enlaces/consultas entregados por Giuliano (46 GET y 4 POST de lectura) respondieron 200 individualmente al menos una vez. La primera pasada corregida obtuvo 41 respuestas 200 y 9 timeouts; se repitieron sólo esas nueve y respondieron 200. No se presenta como 50 respuestas simultáneas, disponibilidad continua ni compatibilidad semántica de todos los servicios. El sondeo amplio registra status, tipo de contenido, tamaño y correlación; no persiste cuerpos administrativos ni modifica datos.

Un primer sondeo envió erróneamente Content-Type: application/json en GET sin cuerpo: G6 devolvió 400 VALIDACION. Se corrigió el cliente de sondeo y se preservó el intento anterior. El BFF/comprobador de catálogo ya omite esa cabecera en GET y no requiere una corrección por este motivo. Los cuatro POST de consulta usan el JSON suministrado por Giuliano.

El comprobador contractual de catálogo, repetido tras el timeout inicial, terminó **25 PASS / 2 FAIL**, ambos por 503 de precio: `category-price-0-100` y `price-0-100`. Su exit 1 se conserva. Home (8 categorías), maestros (8 categorías/6 marcas), búsqueda Nike (7 productos), marca, categoría, nombres ASC/DESC, páginas, detalle ID/slug y 404 pasaron. No hubo duplicados observados en las páginas comprobadas; no se encontraron nombres iguales para probar desempate.

La matriz por **Next → BFF → G6** terminó **21 PASS, 0 FAIL, 2 BLOCKED y 2 INCONCLUSIVE**. Los bloques fueron F008 precio/combinados por HTTP 503; los inconclusos, F006 sin selección editorial y F009 sin nombres empatados. La distinción BLOCKED/INCONCLUSIVE se mantiene, no se suman como aprobados.

## Capturas originales

Sólo tres capturas REAL, sin interceptar respuestas:

1. [Home REAL](screenshots/01-home-real.png): ocho categorías, sin ranking inventado.
2. [Nike REAL](screenshots/02-nike-real.png): cuatro tarjetas de siete productos, imágenes y paginación.
3. [Error de precio REAL en móvil](screenshots/03-precio-real-error.png): criterios conservados, indisponibilidad y reintento.

`browser-real.json` registra URL, tarjetas, categorías, texto visible y cero pageerrors en esos recorridos. Las capturas muestran el frontend local; no representan un despliegue G1 compartido.

## Avance por función y cierre pendiente

| Función | Comprobado ahora | Falta para cierre |
|---|---|---|
| F006 | Home REAL con 8 categorías; prioridad/editoriales MOCK en 5 recorridos | Fuente/adaptador de ranking G5 o decisión explícita de alcance por PO; selección aprobada cuando corresponda y aceptación |
| F007 | Nike 7 productos, búsqueda vacía y errores/recuperación; Next/BFF REAL | Publicación G1 y aceptación por criterio/revisor |
| F008 | Categorías y marcas REAL, combinación sin precio | G6 debe resolver 503 de precio; repetir elegibilidad monetaria global con datos conocidos y QA |
| F009 | ASC/DESC y orden entre páginas | Dataset con nombres iguales para desempate por ID y aceptación |
| F010 | Páginas primera/segunda/última/fuera de rango y no solapamiento observado | Aceptación con universo estable conocido y entorno publicado |
| DOC | Enlaces y consistencia de las entregas revisados | Revisión independiente y merge de SPECS #16 |
| F014 adyacente | HTTP y navegador MOCK cubren cuatro estados y reintento sin compra | REAL/contrato/aceptación; SPECS #17 depende del borrador #12, que sigue abierto hacia main |

Las 22 pruebas omitidas de BD se conservan como omitidas. No se obtuvo un servicio PostgreSQL temporal/Docker operativo para esas suites; no se usó una BD del equipo. No se certifican grants, SHA desplegado G6/G1, aceptación de otro revisor ni disponibilidad F014 REAL. Las issues no se cerraron y los PR no se fusionaron.

## Cambios preparados

- Backend: regresiones nuevas incluidas en `npm run test:g6:probe` (12 PASS en la ejecución final), --base-url para el comprobador Azure, seis regresiones de validación y guía `docs/G6-GATEWAY-2026-11-07.md`.
- Frontend: sincronización del test de orden global con respuesta y render reales; mantiene la aserción de orden.
- Evidencia: JSON saneados y estas tres capturas. Los runners y logs completos permanecen en la carpeta de validación local.

## Reproducción

```sh
# Backend
npm ci
npm run build
npm run typecheck
NODE_ENV=test USE_MOCKS=true AUTH_ISSUER=https://security.example.test AUTH_JWKS_URL=https://security.example.test/jwks DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/not_connected npm test
node --test scripts/check-g6-azure.test.mjs
npm run check:g6:azure -- --base-url https://api-gateway.calmgrass-aec0b33c.chilecentral.azurecontainerapps.io --consumer --output gateway-consumer.json
# Frontend (Backend como directorio hermano G1-Marketplace-Backend)
npm ci
npm run test:components -- --maxWorkers=2
npm run test:server
npm run lint
npm run build
npm run typecheck
npx playwright test tests/catalog.spec.ts tests/catalog-h4.spec.ts tests/catalog-visual-h4.spec.ts tests/issues tests/product-detail.e2e.spec.ts tests/product-commerce.e2e.spec.ts
npx playwright test --config playwright.featured.config.ts
```

En este equipo se usaron configuraciones locales equivalentes con executablePath=/usr/bin/chromium, sin cambiar las configuraciones versionadas. `npm test` del ejemplo backend reproduce unitarias/HTTP/emisor/probe; las herramientas H4 y OpenAPI se ejecutan además por separado, como consta en `backend-checks.json`.

## Historial de publicación

Se preparan comentarios detallados para Backend #265/#266/#276/#277, Frontend #124/#125 y SPECS #16/#17. Se intentó comentar SPECS #16: GitHub devolvió `403 Resource not accessible by integration`. La alternativa Git tampoco dispone de credenciales (`could not read Username`, prompts deshabilitados). Ese primer intento quedó bloqueado. Después Giuliano autenticó GitHub CLI con acceso repo; la publicación se retoma por esa vía. Los comentarios finales de los PR enlazan las evidencias publicadas.
