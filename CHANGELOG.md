## [1.5.0](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/compare/v1.4.0...v1.5.0) (2026-11-05)

### Features

* **catalog:** habilitar client_credentials opt-in para G6 ([7554b08](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/7554b0831c012bdbb20220be49f4c07b6000744d))

## [1.4.0](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/compare/v1.3.0...v1.4.0) (2026-11-05)

### Features

* **f014:** disponibilidad indeterminada y contrato OpenAPI coherente ([bc6fd4d](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/bc6fd4de27142d0ef59bf3dbabf804e69434c9e6))

## [1.3.0](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/compare/v1.2.0...v1.3.0) (2026-11-05)

### Features

* **catalogo:** cerrar demo MOCK de filtros, orden y paginación H4 ([0246295](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/02462957b4149f95bdce9451ab05d26489e075d9))

## [1.2.0](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/compare/v1.1.0...v1.2.0) (2026-11-05)

### Features

* **docs:** publicar Swagger UI con los contratos OpenAPI en /docs ([a979634](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/a979634e02629be4f6953d4066060564e6ee4bd2))

## [1.1.0](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/compare/v1.0.1...v1.1.0) (2026-11-05)

### Features

* **catalog:** endpoints comerciales F-011 a F-015 y contrato OpenAPI en modo MOCK ([f24741f](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/f24741faa00d71bf72d20d67c5596920f5fb598c))

## [1.0.1](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/compare/v1.0.0...v1.0.1) (2026-11-04)

### Bug Fixes

* **auth:** no reenviar errores fuera del contrato de reset (400/403/409) en password/restablecer ([73f195e](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/73f195ef276721b64e8fc4f18c256deec9824d56))

## 1.0.0 (2026-11-04)

### Features

* **auth:** implementar login MFA y sesiones G7 para H4 ([068fbf9](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/068fbf9cec95304a405b5af0921cd8b24e4079d9))
* **auth:** preparar introspeccion G7 con credencial tecnica privada ([224486b](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/224486b9f9e4228887c5700af350840107955e46))
* **auth:** preparar registro y recuperacion G7 con gates H4 ([06f950f](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/06f950f455d39de8b9920e840b18ca27c2358b97))
* **backend:** align mock cart and checkout identity ([#23](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/23)) ([cd0b93a](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/cd0b93a1949aa7b08ecc3495dc5a1224d51dbe14))
* **backend:** implement checkout mocks F-022-F-027 ([1cf08d8](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/1cf08d8851bda60ddaa846572ff435ac7105ed89))
* **cart:** alinear autenticacion RS256 con AuthGuard y eliminar extraccion manual de customerId ([f2151a8](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/f2151a85f1eb079f45ccc93c30e5436ce6812c2b))
* **cart:** implementar DELETE idempotente de item del carrito y versionado optimista (F-018) ([adfc2d3](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/adfc2d3ccec706f78ca1577972a9426019778113))
* **cart:** implementar endpoint PATCH /api/v1/carts/current/items/:sku para cambio de cantidad (F-017) ([094f6e4](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/094f6e449b1d3795657351825c39bfdce4bcbf21))
* **cart:** implementar fusion transaccional de carrito anonimo F-020 (closes [#104](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/104), [#105](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/105), [#107](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/107)) ([914b5ad](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/914b5adad2bc8144f8a3bbeef49e24ddedbfaa3e))
* **cart:** implementar GET /api/v1/carts/current con enriquecimiento y subtotal (F-019) ([7b2d92c](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/7b2d92cea200c4fd3412ab0e1e8204d4255f9ed7))
* **cart:** implementar GET /api/v1/carts/current con enriquecimiento y subtotal (F-019) ([ba186fb](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/ba186fbce8e440ea6d4a5437d1812b9246d76f61))
* **cart:** implementar servicios y endpoints de carrito con pruebas ([c13b4b1](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/c13b4b139e6bd2ed890c2fce6d0647d16c071486))
* **cart:** migrar modulo de carrito a NestJS y alinear identidad con Checkout ([86cc690](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/86cc690fd5fd4286676f87b1cc207cdda13ec7c6))
* **cart:** migrar modulo de carrito a NestJS y fusionar develop ([3133cde](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/3133cde8219dbbf52bfd905bbad2cfdecbddb137))
* **cart:** trasladar item del carrito a favoritos F-021 (closes TASK-F021-BE-001, TASK-F021-DB-001, TASK-F021-INT-001, TASK-F021-QA-002, TASK-F021-DOC-001) ([3ecc219](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/3ecc21907b3a8e6c2bb4da178464a5e3c92ff143))
* **catalog:** connect G6 demo without service JWT ([d40b864](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/d40b8641949ab2dbf2971bbd4176fcc5e6544cbc))
* **catalog:** ficha de producto F-011 BFF modo MOCK (H3) ([50f49a1](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/50f49a1060ed7eed0ea4ba0ce5e7ad5edc135dae))
* **catalog:** ficha por cada tarjeta del listado y 404 sin fallback ([cac413c](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/cac413c1d5eb560217d24a84f82b4a794d327462)), closes [#11](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/11)
* **catalog:** migrar F-011 al baseline NestJS de develop ([2173967](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/2173967c7bf0a28eb6349e6277a5c924d99bae91))
* **catalogo:** adaptar H3 al baseline NestJS de develop ([055ec99](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/055ec995ddd6719551c5ebf1a50abd841093dc27))
* **catalogo:** completar filtros y validar paginacion de H4 ([2701962](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/27019628bb49ba9db1ea82bad5dba8436cee376b))
* **catalogo:** implementar BFF y adaptador de Productos ([3357609](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/3357609c4d44235722fc63b9cbebc9ec67d7febd))
* **checkout-mock:** recover orders by idempotency key ([c6a747d](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/c6a747dfb51437fe2c1e7dda23ecbd45eb1a3bc8))
* **checkout:** add local mock JWT issuer ([ddc7321](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/ddc7321a5598bbb8b823ee6240ef95ca61807707))
* **checkout:** validate quote context and ownership ([5bb21af](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/5bb21afa4ff1e9e78ff1753557246d33b73aa8a4))
* **favoritos:** implementar agregar y quitar por cliente en sandbox ([a7d26f3](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/a7d26f3434b87d2a1d88f0bff8fe473c0e548bcf))
* **favoritos:** listar y agregar al carrito conservando favorito ([e0147eb](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/e0147eb5a87b102c41d718d59acef4d84c33ea3a))
* **h3:** implementar adaptador de acceso MOCK F-002 ([6739c18](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/6739c188d63648741a97aa9dd6a3ca83e9195718))
* **h3:** preparar entorno Docker local con PostgreSQL y web ([b6a186a](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/b6a186a446378a6773e22f5d1e1fcab1321ea7ee))
* **orders:** implement H3 mock history backend ([a57019e](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/a57019e131101e3dd3508e50ed48d9035a285cd2))
* setup docker, prisma baseline and render blueprint" ([5c24ae2](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/5c24ae20cbae68655ebdc1137b97de37e0a3417f))

### Bug Fixes

* actualizar dependencias y acreditar sesion real G7 A/B ([0442c6c](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/0442c6c8000991b793dbfafc52e979cdf5769bd4))
* atender auditoria de salud evidencia y OpenAPI del PR 15 ([de049b1](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/de049b16fb3323aa5598262b5d08243791f353ba))
* **auth:** ampliar espera de login y OTP hacia G7 ([#259](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/259)) ([6387831](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/63878316f95a8e1852f6352d8135f83a2a63973e))
* **auth:** clasificar rechazo de sesión G7 sin datos sensibles ([86b2b27](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/86b2b2791e1a44b64e9de9c3965d2e073833677f))
* **auth:** conservar desafío para reenvío tras OTP vencido ([d1f6cdc](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/d1f6cdc3fe773fe9d0d7feab6c859a7935291fa8))
* **auth:** diagnosticar etapa posterior a OTP sin datos sensibles ([5c792bd](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/5c792bdbee8c630719651bf89cdcd750d9410a4a))
* **auth:** enviar canalOrigen MARKETPLACE fijo en recuperacion F-004 ([edf8f47](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/edf8f476a88094e7fbe51c227b17719201ff4616))
* **auth:** neutralizar errores del proveedor en recuperacion a 503 (F-004) ([39a1cc9](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/39a1cc9ae720d934200b8635eab32ff7eded1117))
* **auth:** registrar causa sanitizada de fallos con G7 ([#257](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/257)) ([149e503](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/149e503fce0a6a412ecd4a7eb5079f7a70b4ce08))
* **auth:** revocar todas las cookies de sesion en logout y ampliar pruebas F-003 ([cacd747](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/cacd7475367e2891bbef747a27e285edf94c66c4))
* **backend:** preserve credentialed cart CORS ([3ee6001](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/3ee60018ce9be1bf5975dfa14ed86f3fb20e7a1d))
* **cart:** limpiar anonymousSessionHash al reclamar carrito para cumplir carts_owner_required_chk ([7edeb45](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/7edeb45a4c787012039c4d1e5ef949bd40789266))
* **cart:** refrescar snapshot de precio y corregir validacion de cantidad (F-017) ([e09f852](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/e09f852a273ab545c6045545f25b564269e03b44))
* **cart:** refrescar snapshot de precio y corregir validacion de cantidad (F-017) ([1609b6c](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/1609b6c2908c0ba3e1e31036967a3a55aefc0bdc))
* **catalog:** address production auth and API review findings ([cc9ecab](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/cc9ecab9eee424b0c1b024d778b6f906f1fac2b5))
* **catalog:** devolver Problem Details y X-Request-Id en el endpoint F-011 ([a35ad43](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/a35ad431977bb2a7ed4cf04b76ca930341e18815))
* **catalogo:** aceptar productos sin imagen del proveedor ([686352d](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/686352d6d63a5f9d906c9d953df29f2adbf9ddd9))
* **checkout:** address review findings and durable retries ([f387fe6](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/f387fe6688e4bdf330098731ac4dd89cb08e4671))
* **checkout:** discard stale benefit quote results ([c32e731](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/c32e7318b651cebad5e998abe5ac554a01303f52))
* **checkout:** isolate mock orders and stale preparations ([efac978](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/efac978b5b09da217b0cd46a98cc71f17db93f75))
* **checkout:** persist order ID only after payment ([73d06d6](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/73d06d6f148e8400c8e9632941b8bf9c7ae1c543))
* **checkout:** reject whitespace-only contact fields ([5714143](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/57141434b85d4ef1b10f744fbabbdaa5e1d40b12))
* **checkout:** resolver sintaxis y unificar findActiveCart tras merge de develop ([44d36c9](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/44d36c964e91438e2c067177526e4f0f23f46856))
* **checkout:** vincular carrito anonimo activo a cliente en modo mock/dev al cotizar ([2860bf5](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/2860bf5e8424f8c764642c0f01ce92bc70522f65))
* **ci:** incluir declaraciones legacy de licencias en el inventario ([63071c8](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/63071c833b7bd72f2ffbfca2f47d0695c9d9992b))
* **db:** aislar verificacion de constraints por esquema para idempotencia en rollback (issue [#204](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/204)) ([d416f8d](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/d416f8dbc6b9a2e815d645297e4e9c843b13bbca))
* **db:** hacer idempotente la migracion de indices y foreign keys en postgresql (issue [#204](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/204)) ([c5ff870](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/c5ff870fd432dccbe8d6948f97dd68fcba4106bf))
* **deps:** actualizar follow-redirects a 1.16.2 (GHSA-mrwp-f3q8-3g9p) ([6d21be2](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/6d21be26810eb02b1df7b2cca032b63adaa7f6d4))
* **deps:** restaurar version de jest compatible con modulos node built-in ([3dcddbb](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/3dcddbb433ac0e3a131a07564bef824dffa59c74))
* **docker:** cargar configuracion privada de Backend en runtime ([9a410af](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/9a410af4342696441f076d20a72a706663f3a18d))
* **e2e:** require postgresql and dynamically register delivery address in cart-checkout integration ([cf757be](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/cf757be589e30048692798cd6a7c36972b06c2a7))
* integrar favoritos con develop y preservar contratos de carrito ([f9b22a6](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/f9b22a6d3f67fc178dd0cb63319873f8584e803c))
* regenerate account ([d98b01c](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/d98b01c9aa2c04f614699df78ef4070b34803472))
* **render:** run migrations in startCommand for free tier ([f57b3f8](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/f57b3f82b0046b8b9389c53508c962fba275f9b8))
* **security:** make synthetic secret control deterministic ([df64047](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/commit/df6404777f75695830f2ccd1626859954fe4a6ed))
