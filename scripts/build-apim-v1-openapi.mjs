import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildOpenApiArtifact, outputFilePath } from './apim-v1-openapi.mjs';

const artifact = buildOpenApiArtifact();
const outputFile = outputFilePath();
mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, artifact.output, 'utf8');

console.log(`OpenAPI subset generated: ${outputFile}`);
console.log(`Contracted operations: ${artifact.contractedOperations.length}`);
console.log(`Excluded source route: ${artifact.sourcePathsOutsideV1.join(', ')}`);
