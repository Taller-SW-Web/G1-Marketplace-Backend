# Build limpio del commit auditado del PR #15

Fecha local: 16/10/2026. Commit validado: `de049b16fb3323aa5598262b5d08243791f353ba`.
Entorno: Windows, PowerShell, Node `v24.16.0`, npm `11.13.0`.

## Preparacion y resultado observado

Se exportaron exclusivamente los archivos versionados del commit con `git archive`
a `.audit/pr-15-build-de049b1/source`. La copia no contenia `.env`, `node_modules`
ni `dist`; no se reutilizo el cliente Prisma generado de la instalacion principal.
No se modificaron codigo, esquema ni lockfile para conseguir el resultado.

1. `npm ci --offline --no-audit --no-fund`: codigo de salida **0**;
   `added 606 packages in 3m`. Se observo un aviso de deprecacion de `glob@10.5.0`.
2. Primer `npm run build` dentro del sandbox: codigo **1**, al solicitar el checksum
   del motor a `https://binaries.prisma.sh`; no llego a completar la generacion.
3. Repeticion autorizada de `npm run build` fuera del sandbox, en la misma copia:
   codigo **0**. Se genero Prisma Client **5.22.0** y termino la compilacion
   TypeScript incluida en el comando. Se verifico la existencia de `dist/main.js`.

Salida del build exitoso (se omiten solo los mensajes promocionales de Prisma):

```text
> g1-marketplace-backend@1.0.0 build
> npm run prisma:generate && tsc -p tsconfig.build.json

> g1-marketplace-backend@1.0.0 prisma:generate
> prisma generate

Prisma schema loaded from prisma\schema.prisma

Generated Prisma Client (v5.22.0) to .\node_modules\@prisma\client in 129ms
```

## Reproduccion

Desde una copia del repositorio que contenga el commit, usar un directorio nuevo:

```powershell
git archive --format=zip --output=source-pr15.zip de049b16fb3323aa5598262b5d08243791f353ba
Expand-Archive -LiteralPath source-pr15.zip -DestinationPath source-pr15
Set-Location source-pr15
npm ci --offline --no-audit --no-fund
npm run build
```

La instalacion offline requiere los paquetes en la cache npm; sin esa cache, usar
`npm ci --no-audit --no-fund`. Prisma requiere acceso a su servidor de binarios
cuando el motor no esta disponible localmente. No se necesita una base de datos
activa para este build.

## Alcance del cierre

Esta ejecucion confirma el build completo del commit auditado en un entorno local
limpio; no constituye un check publicado en GitHub ni una ejecucion de CI.
No se repitieron las suites unitarias, HTTP, mock, PostgreSQL ni smoke en este corte.
Sus resultados anteriores siguen siendo evidencia historica separada.

Sigue pendiente que el equipo confirme si algun consumidor externo utiliza
`database.carts` o `database.wishlistItems` en `/`, `/health` o `/ready`. Para cerrar
ese punto, registrar responsable, fecha y sistemas revisados, indicando si se usan
los conteos. Si no hay consumidores, no hace falta cambiar codigo; si los hay,
acordar la compatibilidad o migracion antes de darlo por cerrado.

Se mantiene el alcance parcial H3: identidad y elegibilidad MOCK, persistencia
PostgreSQL local. UI, F-037, integraciones reales y G-UNDO siguen pendientes;
esta validacion no acredita el cierre integral de F-036/F-038.
