import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const DATABASE_ENV = 'SECURITY_EVENTS_TEST_DATABASE_URL';
const EXPECTED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const EXPECTED_PORT = '55433';
const EXPECTED_DATABASE = 'marketplace_security_events_test';
const EXPECTED_USER = 'security_events_test';

interface DatabaseTarget {
  host: string;
  port: string;
  database: string;
}

function parseDatabaseTarget(name: string, value: string): { url: URL; target: DatabaseTarget } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error(`${name} must use PostgreSQL with a host and database`);
  }

  let database: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error(`${name} must contain a valid database name`);
  }

  return {
    url,
    target: {
      host: EXPECTED_HOSTS.has(url.hostname) ? 'loopback' : url.hostname.toLowerCase(),
      port: url.port || '5432',
      database,
    },
  };
}

function sameDatabase(left: DatabaseTarget, right: DatabaseTarget): boolean {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

export function validateSecurityEventsTestDatabase(env: NodeJS.ProcessEnv): string {
  const value = env[DATABASE_ENV];
  if (!value?.trim()) throw new Error(`${DATABASE_ENV} is required`);

  const { url, target } = parseDatabaseTarget(DATABASE_ENV, value);
  if (!EXPECTED_HOSTS.has(url.hostname) || url.port !== EXPECTED_PORT
    || target.database !== EXPECTED_DATABASE || decodeURIComponent(url.username) !== EXPECTED_USER) {
    throw new Error(`${DATABASE_ENV} must target the dedicated loopback PostgreSQL on port 55433`);
  }
  if (url.password.length === 0 || url.hash) {
    throw new Error(`${DATABASE_ENV} must include local credentials and no fragment`);
  }
  for (const [key, queryValue] of url.searchParams) {
    if (key !== 'schema' || queryValue !== 'public') {
      throw new Error(`${DATABASE_ENV} may only specify schema=public`);
    }
  }

  if (String(env.NODE_ENV ?? '').toLowerCase() === 'production') {
    throw new Error('Security-events database commands are disabled in production');
  }
  const enabled = String(env.SECURITY_EVENTS_ENABLED ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(enabled)) {
    throw new Error('SECURITY_EVENTS_ENABLED must be true or false');
  }
  if (enabled === 'true') {
    throw new Error('Keep SECURITY_EVENTS_ENABLED=false while preparing or migrating the isolated database');
  }

  for (const name of ['DATABASE_URL', 'TEST_DATABASE_URL']) {
    const otherValue = env[name];
    if (!otherValue?.trim()) continue;
    const { target: otherTarget } = parseDatabaseTarget(name, otherValue);
    if (sameDatabase(target, otherTarget)) {
      if (name === 'DATABASE_URL' && otherValue === value) continue;
      throw new Error(`${DATABASE_ENV} must differ from ${name}`);
    }
  }

  return value;
}

function run(): void {
  try {
    const action = process.argv[2] ?? 'check';
    if (action !== 'check' && action !== 'migrate') {
      throw new Error('Use action check or migrate');
    }

    const databaseUrl = validateSecurityEventsTestDatabase(process.env);
    process.stdout.write('Isolated security-events PostgreSQL target validated; credentials omitted.\n');
    if (action === 'check') return;

    const prismaCli = resolve('node_modules/prisma/build/index.js');
    const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });
    if (result.error) throw new Error('Could not start the Prisma migration command');
    process.exitCode = result.status ?? 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Security-events database command failed'}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) run();
