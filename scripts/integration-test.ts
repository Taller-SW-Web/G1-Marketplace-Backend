import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { validateTestDatabase } from './test-database';

try {
  const databaseUrl = validateTestDatabase(process.env);
  const env = { ...process.env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl, NODE_ENV: 'test' };
  for (const [script, args] of [
    ['node_modules/prisma/build/index.js', ['migrate', 'deploy']],
    ['node_modules/jest/bin/jest.js', ['--config', 'test/jest-integration.json', '--runInBand']],
  ] as const) {
    const result = spawnSync(process.execPath, [resolve(script), ...args], { env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('Integration command failed');
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Integration failed'}\n`);
  process.exitCode = 1;
}
