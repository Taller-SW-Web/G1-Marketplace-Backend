# Dependencias: corrección del gate H4 del 23/10

La ejecución [40055378270](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/actions/runs/40055378270), SHA `580f014`, pasó sus pruebas HTTP/PostgreSQL y falló en SCA. Las conclusiones de inventarios anteriores se mantienen como históricas; no describen el registro de avisos actual.

`npm audit` local reprodujo 4 paquetes afectados: tres clasificados high por body-parser/multer y la propagación a platform-express, uno moderate por fast-uri. Fuente: avisos de mantenedores publicados en GitHub: [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828), [multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m), [fast-uri](https://github.com/advisories/GHSA-w74x-v6f9-j3xg).

## Cambio acotado

| Paquete | Anterior | Nuevo | Resolución |
|---|---|---|---|
| body-parser | 2.3.0 | 2.4.0 | Actualización en el rango de Express 5.2.1 |
| fast-uri | 3.1.8 | 3.1.9 | Parche en el rango de AJV; dependencia de herramientas |
| multer | 2.4.0 | 2.5.0 | Override exacto sólo bajo @nestjs/platform-express |

Se conservan Nest 11.2.7 y Express 5.2.1; no se ejecutó `audit fix --force`. Nest fija multer 2.4.0; el override permite consumir su corrección 2.5.0 hasta que el padre la incorpore. Revisarlo/eliminarlo cuando una actualización compatible de Nest ya incluya una versión corregida. La compatibilidad del override requiere pruebas; no es una exención del escaneo.

## Verificado localmente

- `npm audit --json`: 0 avisos (todos los niveles, dependencias de desarrollo incluidas), registro del 23/10.
- `npm ls body-parser multer fast-uri --all`: sólo las versiones indicadas.
- `npm run build`: PASS.
- `npm run test:unit`: 148 PASS, 16 suites.
- `npm run test:e2e -- test/account-g7.e2e-spec.ts test/g7-introspection.e2e-spec.ts test/auth.e2e-spec.ts`: 37 PASS, 3 suites; proveedor simulado, sin PostgreSQL local.

La prueba de sesiones con PostgreSQL y los escaneos completos se vuelven a ejecutar en CI sobre este cambio. No se anuncia PASS antes de obtener su resultado. La base G1 compartida no fue modificada.
