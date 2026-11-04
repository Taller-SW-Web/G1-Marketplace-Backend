// Valida con swagger-cli todos los contratos OpenAPI de docs/contratos.
// Uso: npm run docs:validate
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

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
    // El nombre proviene de readdirSync y está filtrado por extensión.
    execSync(`npx --yes @apidevtools/swagger-cli validate "${join(dir, file)}"`, {
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
