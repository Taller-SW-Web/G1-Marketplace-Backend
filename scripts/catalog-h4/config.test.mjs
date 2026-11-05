import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inspectCatalogConfig } from './config.mjs';
const require = createRequire(import.meta.url);
const { CONTRACT_VERSION, CONTRACT_SHA } = require('../../dist/catalog/provider.js');
test('empty configuration reports missing prerequisites without attempting HTTP', () => {
  const result = inspectCatalogConfig({});
  assert.equal(result.source, 'UNCONFIGURED'); assert.equal(result.checks.serviceTokenPresent, false);
});
test('the actual constructor accepts configured REAL, but the inspector does not certify auth or approval', () => {
  const result = inspectCatalogConfig({ NODE_ENV: 'test', CATALOG_SOURCE: 'real', CATALOG_INTEGRATION_APPROVED: 'true',
    PRODUCTOS_BASE_URL: 'https://provider.example', PRODUCTOS_SERVICE_TOKEN: 'synthetic-test-token',
    PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA });
  assert.equal(result.source, 'REAL'); assert.equal(result.checks.serviceTokenPresent, true);
  assert.equal(result.grantVerified, false); assert.equal(result.approvalVerified, false);
});
test('invalid origins, credentials and IDs never appear in the report', () => {
  const result = inspectCatalogConfig({ CATALOG_SOURCE: 'real', PRODUCTOS_BASE_URL: 'https://user:private@provider.example/',
    PRODUCTOS_SERVICE_TOKEN: 'synthetic-private-value', CATALOG_FEATURED_IDS: 'private-selection' });
  const text = JSON.stringify(result);
  assert.ok(!text.includes('synthetic-private-value')); assert.ok(!text.includes('private-selection'));
  assert.ok(!text.includes('user:private')); assert.equal(result.source, 'UNCONFIGURED');
});

test('explicit production public reads need no token but do not certify deployment or a grant', () => {
  const result = inspectCatalogConfig({ NODE_ENV: 'production', CATALOG_SOURCE: 'real',
    CATALOG_INTEGRATION_APPROVED: 'true', PRODUCTOS_AUTH_MODE: 'public-read-only',
    PRODUCTOS_BASE_URL: 'https://provider.example',
    PRODUCTOS_CONTRACT_VERSION: CONTRACT_VERSION, PRODUCTOS_CONTRACT_SHA: CONTRACT_SHA });
  assert.equal(result.source, 'REAL'); assert.equal(result.checks.publicReadOnlySelected, true);
  assert.equal(result.checks.serviceTokenPresent, false); assert.equal(result.checks.demoNoAuthSelected, false);
  assert.equal(result.grantVerified, false); assert.equal(result.deployedShaVerified, false);
});
