// Valida con swagger-cli (versión fijada en devDependencies) todos los contratos
// OpenAPI de docs/contratos. No pasa por ningún shell: los argumentos se entregan
// separados al proceso.
// Uso: npm run docs:validate
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const swaggerCli = require.resolve('@apidevtools/swagger-cli/bin/swagger-cli.js');

const dir = join(process.cwd(), 'docs', 'contratos');
const files = readdirSync(dir)
  .filter((name) => /\.(?:ya?ml|json)$/.test(name))
  .sort();

if (files.length === 0) {
  console.error(`No se encontraron contratos en ${dir}`);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, [swaggerCli, 'validate', join(dir, file)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(`OK    ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`FALLA ${file}`);
    console.error(String(error.stderr || error.stdout || error.message));
  }
}

if (failed > 0) {
  console.error(`${failed} contrato(s) inválido(s) de ${files.length}.`);
  process.exit(1);
}
console.log(`${files.length} contrato(s) válidos.`);
