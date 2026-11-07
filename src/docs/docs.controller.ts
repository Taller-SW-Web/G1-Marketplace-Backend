import { Controller, Get, Header, NotFoundException, Param, Res } from '@nestjs/common';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface HeaderResponse {
  setHeader(name: string, value: string): unknown;
}

const SPEC_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:ya?ml|json)$/;
const LABELS: Record<string, string> = {
  'auth-h4.openapi.yaml': 'Auth — cuenta y sesión (F-001–F-005)',
  'openapi-catalogo-h4.json': 'Catálogo (F-006–F-010)',
  'openapi-h3.json': 'Carrito y favoritos',
  'checkout-h4.openapi.yaml': 'Checkout (F-022–F-027)',
};

export function contractsDir(): string {
  return process.env.CONTRACTS_DIR ?? join(process.cwd(), 'docs', 'contratos');
}

async function listSpecs(): Promise<string[]> {
  const names = await readdir(contractsDir()).catch(() => [] as string[]);
  return names.filter((name) => SPEC_FILE.test(name)).sort();
}

const PAGE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Marketplace G1 — Documentación de la API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
  <style>body{margin:0}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"></script>
  <script>
    fetch('/docs/specs')
      .then(function (r) { return r.json(); })
      .then(function (specs) {
        SwaggerUIBundle({
          dom_id: '#swagger-ui',
          urls: specs,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
          'urls.primaryName': specs.length ? specs[0].name : undefined,
          deepLinking: true,
          tryItOutEnabled: false
        });
      });
  </script>
</body>
</html>`;

@Controller('docs')
export class DocsController {
  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/html; charset=utf-8')
  page(): string {
    return PAGE;
  }

  @Get('specs')
  @Header('Cache-Control', 'no-store')
  async specs(): Promise<Array<{ name: string; url: string }>> {
    return (await listSpecs()).map((file) => ({
      name: LABELS[file] ?? file,
      url: `/docs/specs/${file}`,
    }));
  }

  @Get('specs/:file')
  @Header('Cache-Control', 'no-store')
  async spec(
    @Param('file') file: string,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<string> {
    // Solo se sirven archivos que existen en la carpeta de contratos: sin rutas arbitrarias.
    if (!SPEC_FILE.test(file) || !(await listSpecs()).includes(file)) {
      throw new NotFoundException();
    }
    response.setHeader(
      'Content-Type',
      file.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/yaml; charset=utf-8',
    );
    return readFile(join(contractsDir(), file), 'utf8');
  }
}
