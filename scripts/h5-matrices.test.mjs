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
  assert.match(matrix, /access-log\.middleware\.ts.*emite `http_access`/);
  assert.match(matrix, /trazabilidad completa F↔test↔run de #299 permanece parcial/);
  assert.match(matrix, /F-029, F-030–F-034, F-039 y F-040 conservan sus estados GAP\/BLOCKED/);
  assert.match(matrix, /F-035 conserva una prueba LOCAL, pero la entrega REAL sigue BLOCKED/);
  assert.match(matrix, /sin adaptador G1 ni prueba HTTP contractual/);
  assert.match(matrix, /no se crea consumidor ni webhook G1/);
});
