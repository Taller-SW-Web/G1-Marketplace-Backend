import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const matrix = readFileSync(new URL('../docs/evidencias/H5/MATRICES-TASK-H5-291-299.md', import.meta.url), 'utf8');

test('H5 #299 traceability matrix contains each functional feature F-001 through F-040 exactly once', () => {
  const ids = [...matrix.matchAll(/^\| (F-\d{3}) \|/gm)].map((match) => match[1]);
  assert.deepEqual(ids, Array.from({ length: 40 }, (_, index) => `F-${String(index + 1).padStart(3, '0')}`));
});

test('H5 matrices distinguish pinned/local evidence from REAL and preserve known integration blockers', () => {
  assert.match(matrix, /LOCAL` = prueba solo con HTTP local\/Prism\/doble/);
  assert.match(matrix, /PIN` = aserción sobre snapshot estático/);
  assert.match(matrix, /no se escribe hoy en un access log uniforme para las 40 F/);
  assert.match(matrix, /sin adaptador G1 ni prueba HTTP contractual/);
  assert.match(matrix, /no se crea consumidor ni webhook G1/);
});
