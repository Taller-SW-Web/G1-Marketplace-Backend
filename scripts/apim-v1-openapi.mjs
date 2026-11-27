import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const SOURCE_CONTRACTS = [
  { file: 'auth-h4.openapi.yaml', id: 'auth', prefix: 'Auth', format: 'yaml' },
  { file: 'checkout-h4.openapi.yaml', id: 'checkout', prefix: 'Checkout', format: 'yaml' },
  { file: 'openapi-catalogo-h4.json', id: 'catalog', prefix: 'Catalog', format: 'json' },
  { file: 'openapi-h3.json', id: 'h3', prefix: 'H3', format: 'json' },
  { file: 'product-detail-h4.openapi.yaml', id: 'productDetail', prefix: 'ProductDetail', format: 'yaml' },
];

export const CONTRACTED_CART_ROUTES = [
  {
    sourceOperation: 'DELETE /api/v1/carts/current/items/{sku}',
    publicOperation: 'DELETE /v1/carts/current/items/{sku}',
  },
  {
    sourceOperation: 'POST /api/v1/carts/current/merge-anonymous',
    publicOperation: 'POST /v1/carts/current/merge-anonymous',
  },
  {
    sourceOperation: 'POST /api/v1/carts/current/items/{sku}/move-to-wishlist',
    publicOperation: 'POST /v1/carts/current/items/{sku}/move-to-wishlist',
  },
];

export const BLOCKED_ROUTES = [];
const BLOCKED_OPERATION_KEYS = new Set(BLOCKED_ROUTES.map(({ operation }) => operation));

export const OPENAPI_METHODS = new Set([
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace',
]);

const ROOT = process.cwd();
const CONTRACTS_DIR = join(ROOT, 'docs', 'contratos');
const OUTPUT_FILE = join(ROOT, 'docs', 'apim', 'marketplace-bff-v1.subset.openapi.yaml');

function parseYamlKey(line, indentation) {
  const spaces = ' '.repeat(indentation);
  if (!line.startsWith(spaces) || line[indentation] === ' ') return undefined;

  const rest = line.slice(indentation);
  let colon = -1;
  let quote;
  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index];
    if (quote === '"' && char === '\\') {
      index += 1;
      continue;
    }
    if (quote === "'" && char === "'" && rest[index + 1] === "'") {
      index += 1;
      continue;
    }
    if (quote && char === quote) {
      quote = undefined;
      continue;
    }
    if (!quote && (char === '"' || char === "'")) {
      quote = char;
      continue;
    }
    if (!quote && char === ':') {
      colon = index;
      break;
    }
  }
  if (colon < 0) return undefined;

  const rawKey = rest.slice(0, colon).trim();
  if (!rawKey) return undefined;
  let key = rawKey;
  if (rawKey.startsWith('"')) {
    try {
      key = JSON.parse(rawKey);
    } catch {
      return undefined;
    }
  } else if (rawKey.startsWith("'")) {
    key = rawKey.slice(1, -1).replaceAll("''", "'");
  }
  return { key, colon, rawKey };
}

function getTopLevelSection(lines, sectionName) {
  const start = lines.findIndex((line) => new RegExp(`^${sectionName}:\\s*(?:#.*)?$`).test(line));
  if (start < 0) return undefined;

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('#') && !line.startsWith('---')) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end);
}

function getMapEntries(sectionLines, indentation) {
  if (!sectionLines) return [];
  const entries = [];
  for (let index = 1; index < sectionLines.length; index += 1) {
    const parsed = parseYamlKey(sectionLines[index], indentation);
    if (!parsed) continue;
    let end = index + 1;
    while (end < sectionLines.length && !parseYamlKey(sectionLines[end], indentation)) end += 1;
    entries.push({
      key: parsed.key,
      keyLineIndex: index,
      lines: sectionLines.slice(index, end),
    });
    index = end - 1;
  }
  return entries;
}

function yamlSourceDocument(file) {
  const text = readFileSync(join(CONTRACTS_DIR, file), 'utf8');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const openapi = lines.find((line) => line.startsWith('openapi:'))?.slice('openapi:'.length).trim();
  if (!openapi) throw new Error(`${file}: falta openapi:`);

  const pathEntries = getMapEntries(getTopLevelSection(lines, 'paths'), 2);
  const componentRoot = getTopLevelSection(lines, 'components');
  const componentSections = getMapEntries(componentRoot, 2).map((section) => ({
    name: section.key,
    entries: getMapEntries(section.lines, 4),
  }));
  if (pathEntries.length === 0) throw new Error(`${file}: no se pudieron leer paths`);
  return {
    text,
    lines,
    openapi,
    pathEntries,
    componentSections,
    securityLines: getTopLevelSection(lines, 'security'),
  };
}

function readSources() {
  return SOURCE_CONTRACTS.map((source) => {
    if (source.format === 'yaml') {
      return { ...source, document: yamlSourceDocument(source.file) };
    }
    const document = JSON.parse(readFileSync(join(CONTRACTS_DIR, source.file), 'utf8'));
    if (typeof document.openapi !== 'string' || !document.paths) {
      throw new Error(`${source.file} no es un documento OpenAPI con paths`);
    }
    return { ...source, document };
  });
}

function sourceComponentInventory(source) {
  if (source.format === 'json') {
    return Object.entries(source.document.components ?? {}).map(([section, entries]) => ({
      section,
      names: Object.keys(entries),
    }));
  }
  return source.document.componentSections.map(({ name, entries }) => ({
    section: name,
    names: entries.map(({ key }) => key),
  }));
}

function componentRenameMaps(sources) {
  const occurrences = new Map();
  for (const source of sources) {
    for (const { section, names } of sourceComponentInventory(source)) {
      for (const name of names) {
        const key = `${section}/${name}`;
        const values = occurrences.get(key) ?? [];
        values.push(source);
        occurrences.set(key, values);
      }
    }
  }

  const renames = new Map(sources.map((source) => [source.id, new Map()]));
  for (const [key, sourcesWithName] of occurrences) {
    if (sourcesWithName.length < 2) continue;
    const separator = key.indexOf('/');
    const section = key.slice(0, separator);
    const name = key.slice(separator + 1);
    for (const source of sourcesWithName) {
      renames.get(source.id).set(`${section}/${name}`, `${source.prefix}${name}`);
    }
  }

  const emittedNames = new Map();
  for (const source of sources) {
    for (const { section, names } of sourceComponentInventory(source)) {
      for (const originalName of names) {
        const key = `${section}/${renames.get(source.id).get(`${section}/${originalName}`) ?? originalName}`;
        const owner = emittedNames.get(key);
        if (owner) throw new Error(`Colision de componente sin resolver: ${key} (${owner} y ${source.file})`);
        emittedNames.set(key, source.file);
      }
    }
  }
  return renames;
}

function rewriteReferenceString(reference, sourceRenames) {
  if (typeof reference !== 'string' || !reference.startsWith('#/components/')) return reference;
  const parts = reference.slice(2).split('/');
  if (parts.length !== 3) return reference;
  const key = `${parts[1]}/${parts[2].replaceAll('~1', '/').replaceAll('~0', '~')}`;
  const renamed = sourceRenames.get(key);
  if (!renamed) return reference;
  return `#/components/${parts[1]}/${renamed.replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

function rewriteJsonReferences(value, sourceRenames) {
  if (Array.isArray(value)) return value.map((entry) => rewriteJsonReferences(entry, sourceRenames));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    key === '$ref' && typeof entry === 'string'
      ? rewriteReferenceString(entry, sourceRenames)
      : rewriteJsonReferences(entry, sourceRenames),
  ]));
}

function rewriteYamlReferences(text, sourceRenames) {
  let result = text;
  for (const [key, newName] of sourceRenames) {
    const separator = key.indexOf('/');
    const section = key.slice(0, separator);
    const name = key.slice(separator + 1);
    const oldRef = `#/components/${section}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    const newRef = `#/components/${section}/${newName.replaceAll('~', '~0').replaceAll('/', '~1')}`;
    const escaped = oldRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`${escaped}(?=$|[\\s\\"',})\\]])`, 'g'), newRef);
  }
  return result;
}

function globalSecurityForYaml(source) {
  const section = source.document.securityLines;
  if (!section) return undefined;
  const header = section[0].slice('security:'.length).trim();
  if (header === '[]') return undefined;
  if (header) return ['      security: ' + header];

  const children = section.slice(1).filter((line) => line.trim().length > 0);
  if (children.length === 0) return undefined;
  return ['      security:', ...children.map((line) => `      ${line}`)];
}

function addInheritedYamlSecurity(pathBlock, securityLines) {
  if (!securityLines) return pathBlock;
  const methods = [];
  for (let index = 1; index < pathBlock.length; index += 1) {
    const parsed = parseYamlKey(pathBlock[index], 4);
    if (parsed && OPENAPI_METHODS.has(String(parsed.key).toLowerCase())) methods.push(index);
  }

  let result = [...pathBlock];
  for (let position = methods.length - 1; position >= 0; position -= 1) {
    const start = methods[position];
    const end = methods[position + 1] ?? result.length;
    const hasSecurity = result.slice(start + 1, end).some((line) => parseYamlKey(line, 6)?.key === 'security');
    if (!hasSecurity) result.splice(start + 1, 0, ...securityLines);
  }
  return result;
}

function quote(value) {
  return JSON.stringify(value).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

function yamlMap(value, indentation) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Se esperaba un objeto OpenAPI para serializar a YAML');
  }
  const lines = [];
  for (const [key, child] of Object.entries(value)) {
    const prefix = `${' '.repeat(indentation)}${quote(key)}:`;
    if (child === null || typeof child !== 'object' || Array.isArray(child) || Object.keys(child).length === 0) {
      lines.push(`${prefix} ${JSON.stringify(child)}`);
    } else {
      lines.push(prefix, yamlMap(child, indentation + 2));
    }
  }
  return lines.join('\n');
}

function yamlMapEntry(key, value, indentation) {
  const prefix = `${' '.repeat(indentation)}${quote(key)}:`;
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
    return `${prefix} ${JSON.stringify(value)}`;
  }
  return `${prefix}\n${yamlMap(value, indentation + 2)}`;
}

function publicPathFor(path) {
  if (path === '/api/v1') return '/v1';
  if (path.startsWith('/api/v1/')) return path.slice('/api'.length);
  return undefined;
}

function methodsInYamlBlock(block) {
  return block.flatMap((line) => {
    const parsed = parseYamlKey(line, 4);
    const method = String(parsed?.key ?? '').toLowerCase();
    return OPENAPI_METHODS.has(method) ? [method] : [];
  });
}

function methodsInJsonPathItem(pathItem) {
  return Object.keys(pathItem).filter((key) => OPENAPI_METHODS.has(key.toLowerCase())).map((key) => key.toLowerCase());
}

function allowedMethods(sourcePath, methods) {
  return methods.filter((method) => !BLOCKED_OPERATION_KEYS.has(`${method.toUpperCase()} ${sourcePath}`));
}

function filterBlockedYamlMethods(block, sourcePath) {
  const filtered = [block[0]];
  let includeCurrentSection = true;
  for (const line of block.slice(1)) {
    const parsed = parseYamlKey(line, 4);
    const key = parsed?.key.toLowerCase();
    if (key && OPENAPI_METHODS.has(key)) {
      includeCurrentSection = !BLOCKED_OPERATION_KEYS.has(`${key.toUpperCase()} ${sourcePath}`);
    } else if (parsed) {
      // Path-level fields (for example parameters) are not operations and remain in the artifact.
      includeCurrentSection = true;
    }
    if (includeCurrentSection) filtered.push(line);
  }
  return filtered;
}

function filterBlockedJsonMethods(pathItem, methods) {
  const allowed = new Set(methods);
  return Object.fromEntries(Object.entries(pathItem).filter(([key]) =>
    !OPENAPI_METHODS.has(key.toLowerCase()) || allowed.has(key.toLowerCase())));
}

function mapPathKeyLine(line, publicPath) {
  const colon = line.indexOf(':');
  if (colon < 0) throw new Error(`Clave de ruta YAML inesperada: ${line}`);
  return `  ${quote(publicPath)}:${line.slice(colon + 1)}`;
}

export function buildOpenApiArtifact() {
  const sources = readSources();
  const renames = componentRenameMaps(sources);
  const operationSources = [];
  const sourcePathsOutsideV1 = [];
  const pathBlocks = [];
  const componentSections = new Map();
  const sourceSecurityErrors = [];
  const emittedOperations = new Set();

  function appendPath(source, sourcePath, methods, block) {
    if (sourcePath === '/health' && source.id === 'h3') {
      sourcePathsOutsideV1.push(`${methods.join(',').toUpperCase()} ${sourcePath}`);
      return;
    }
    const publicPath = publicPathFor(sourcePath);
    if (!publicPath) {
      sourcePathsOutsideV1.push(`${methods.join(',').toUpperCase()} ${sourcePath}`);
      return;
    }
    if (methods.length === 0) throw new Error(`${source.file} ${sourcePath} no contiene operaciones`);
    for (const method of methods) {
      const key = `${method.toUpperCase()} ${sourcePath}`;
      if (emittedOperations.has(key)) throw new Error(`Operacion duplicada en fuentes: ${key}`);
      emittedOperations.add(key);
      operationSources.push({ method: method.toUpperCase(), sourcePath, publicPath, file: source.file });
    }
    pathBlocks.push(block);
  }

  for (const source of sources) {
    const sourceRenames = renames.get(source.id);
    if (source.format === 'yaml') {
      const securityErrors = getTopLevelSection(source.document.lines, 'x-security-errors');
      if (securityErrors) {
        sourceSecurityErrors.push(`  ${quote(`docs/contratos/${source.file}`)}:\n${securityErrors.slice(1).map((line) => `  ${line}`).join('\n')}`);
      }
      const inheritedSecurity = globalSecurityForYaml(source);
      for (const entry of source.document.pathEntries) {
        const allMethods = methodsInYamlBlock(entry.lines);
        const methods = allowedMethods(entry.key, allMethods);
        if (methods.length === 0) continue;
        let block = filterBlockedYamlMethods(entry.lines, entry.key);
        const sourcePath = entry.key;
        const publicPath = publicPathFor(sourcePath);
        if (sourcePath === '/health' && source.id === 'h3') {
          appendPath(source, sourcePath, methods, []);
          continue;
        }
        if (!publicPath) {
          appendPath(source, sourcePath, methods, []);
          continue;
        }
        block[0] = mapPathKeyLine(block[0], publicPath);
        block = addInheritedYamlSecurity(block, inheritedSecurity);
        block = rewriteYamlReferences(block.join('\n'), sourceRenames).split('\n');
        appendPath(source, sourcePath, methods, block);
      }

      for (const section of source.document.componentSections) {
        const existing = componentSections.get(section.name) ?? [];
        for (const entry of section.entries) {
          const newName = sourceRenames.get(`${section.name}/${entry.key}`) ?? entry.key;
          let block = [...entry.lines];
          const keyLine = block[0];
          const parsed = parseYamlKey(keyLine, 4);
          block[0] = `${' '.repeat(4)}${newName}:${keyLine.slice(4 + parsed.colon + 1)}`;
          block = rewriteYamlReferences(block.join('\n'), sourceRenames).split('\n');
          existing.push(block.join('\n'));
        }
        componentSections.set(section.name, existing);
      }
      continue;
    }

    if (source.document['x-security-errors'] !== undefined) {
      sourceSecurityErrors.push(yamlMapEntry(`docs/contratos/${source.file}`, source.document['x-security-errors'], 2));
    }

    for (const [sourcePath, originalPathItem] of Object.entries(source.document.paths)) {
      const methods = allowedMethods(sourcePath, methodsInJsonPathItem(originalPathItem));
      if (methods.length === 0) continue;
      if (sourcePath === '/health' && source.id === 'h3') {
        appendPath(source, sourcePath, methods, []);
        continue;
      }
      const publicPath = publicPathFor(sourcePath);
      if (!publicPath) {
        appendPath(source, sourcePath, methods, []);
        continue;
      }
      const pathItem = rewriteJsonReferences(filterBlockedJsonMethods(originalPathItem, methods), sourceRenames);
      if (source.document.security !== undefined && source.document.security.length > 0) {
        for (const method of methods) {
          if (pathItem[method].security === undefined) pathItem[method].security = source.document.security;
        }
      }
      const block = yamlMapEntry(publicPath, pathItem, 2).split('\n');
      appendPath(source, sourcePath, methods, block);
    }

    for (const [sectionName, entries] of Object.entries(source.document.components ?? {})) {
      const existing = componentSections.get(sectionName) ?? [];
      for (const [originalName, originalValue] of Object.entries(entries)) {
        const newName = sourceRenames.get(`${sectionName}/${originalName}`) ?? originalName;
        const value = rewriteJsonReferences(originalValue, sourceRenames);
        existing.push(yamlMapEntry(newName, value, 4));
      }
      componentSections.set(sectionName, existing);
    }
  }

  const contractedOperations = operationSources.filter(({ sourcePath }) => sourcePath.startsWith('/api/v1/'));
  if (contractedOperations.length !== 41) {
    throw new Error(`Se esperaban 41 operaciones bajo /api/v1 y se encontraron ${contractedOperations.length}`);
  }
  if (sourcePathsOutsideV1.length !== 1 || sourcePathsOutsideV1[0] !== 'GET /health') {
    throw new Error(`Cambió la superficie fuera de /api/v1: ${JSON.stringify(sourcePathsOutsideV1)}`);
  }

  const outputPaths = new Set();
  const pathsText = pathBlocks.map((block) => {
    const firstLine = block[0];
    const parsed = parseYamlKey(firstLine, 2);
    if (!parsed || !parsed.key.startsWith('/v1/')) {
      throw new Error(`Ruta consolidada inválida: ${firstLine}`);
    }
    if (outputPaths.has(parsed.key)) throw new Error(`Ruta duplicada al consolidar: ${parsed.key}`);
    outputPaths.add(parsed.key);
    return block.join('\n');
  }).join('\n');

  const componentText = [...componentSections.entries()].map(([section, entries]) => {
    if (entries.length === 0) return undefined;
    return `  ${section}:\n${entries.map((entry) => {
      if (/^\s{4}/.test(entry)) return entry;
      throw new Error(`Componente con sangría inesperada en ${section}`);
    }).join('\n')}`;
  }).filter(Boolean).join('\n');

  const blockedText = BLOCKED_ROUTES.length > 0
    ? BLOCKED_ROUTES.map(({ operation }) => `  - ${quote(operation)}`).join('\n')
    : '  []';
  const sourceText = SOURCE_CONTRACTS.map(({ file }) => `  - ${quote(`docs/contratos/${file}`)}`).join('\n');
  const output = [
    'openapi: 3.1.0',
    'info:',
    '  title: "Marketplace BFF APIM /v1 - contracted subset"',
    '  version: "1.0.0"',
    '  description: >-',
    '    Import candidate containing only the 41 documented /api/v1 operations from the five source contracts.',
    '    This is a contracted subset of the BFF, not the complete BFF contract. It has no backend server URL.',
    '    It does not configure, import, or deploy an APIM API or backend.',
    'x-artifact-scope: "contracted-subset-of-bff-not-complete-contract"',
    'x-source-contracts:',
    sourceText,
    'x-excluded-source-routes:',
    '  - "GET /health"',
    'x-blocked-uncontracted-bff-routes:',
    blockedText,
    'x-backend-host-configured: false',
    ...(sourceSecurityErrors.length > 0
      ? ['x-source-security-errors:', sourceSecurityErrors.join('\n')]
      : []),
    'paths:',
    pathsText,
    'components:',
    componentText,
    '',
  ].join('\n');

  return {
    output,
    operationSources,
    contractedOperations,
    sourcePathsOutsideV1,
    componentSections,
    renames,
    outputFile: OUTPUT_FILE,
  };
}

export function expectedOperationKeys(result) {
  return result.contractedOperations.map(({ method, publicPath }) => `${method} ${publicPath}`).sort();
}

export function outputPathOperations(text) {
  const lines = text.split(/\r?\n/);
  const paths = getTopLevelSection(lines, 'paths');
  if (!paths) throw new Error('El OpenAPI consolidado no tiene una sección paths');
  const operations = [];
  const pathEntries = getMapEntries(paths, 2);
  for (const entry of pathEntries) {
    const methods = methodsInYamlBlock(entry.lines);
    if (methods.length === 0) throw new Error(`Path Item sin operaciones: ${entry.key}`);
    for (const method of methods) operations.push(`${method.toUpperCase()} ${entry.key}`);
  }
  return { paths: pathEntries.map(({ key }) => key), operations: operations.sort(), pathEntries };
}

export function outputComponentInventory(text) {
  const lines = text.split(/\r?\n/);
  const components = getTopLevelSection(lines, 'components');
  if (!components) throw new Error('El OpenAPI consolidado no tiene una sección components');
  const inventory = new Map();
  for (const section of getMapEntries(components, 2)) {
    inventory.set(section.key, new Set(getMapEntries(section.lines, 4).map(({ key }) => key)));
  }
  return inventory;
}

export function findComponentReferences(text) {
  const references = [];
  const pattern = /(?:"\$ref"|\$ref)\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s,}\]]+))/g;
  for (const match of text.matchAll(pattern)) {
    references.push(match[1] ?? match[2] ?? match[3]);
  }
  return references;
}

export function outputOperationBlock(entry, method) {
  const indices = [];
  for (let index = 1; index < entry.lines.length; index += 1) {
    const parsed = parseYamlKey(entry.lines[index], 4);
    if (parsed && OPENAPI_METHODS.has(String(parsed.key).toLowerCase())) indices.push(index);
  }
  for (let position = 0; position < indices.length; position += 1) {
    const start = indices[position];
    const end = indices[position + 1] ?? entry.lines.length;
    const parsed = parseYamlKey(entry.lines[start], 4);
    if (String(parsed?.key).toLowerCase() === method.toLowerCase()) {
      return entry.lines.slice(start, end);
    }
  }
  return undefined;
}

export function outputFilePath() {
  return OUTPUT_FILE;
}
