import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const origin of ['http://example.test', 'https://user:password@example.test', 'https://example.test/api/v1', 'https://example.test?token=x', 'https://example.test#fragment', 'https://example.test/']) {
  test('rejects noncanonical or unsafe origin: ' + origin, () => {
    const result = spawnSync(process.execPath, ['scripts/check-g6-azure.mjs', '--base-url', origin], { encoding: 'utf8', timeout: 3000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /base-url must be an HTTPS origin/);
    assert.equal(result.stdout, '');
  });
}
