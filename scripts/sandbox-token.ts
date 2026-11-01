import 'dotenv/config';
import { validateEnvironment } from '../src/config/environment';
import { issueSandboxToken, SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';

try {
  const config = validateEnvironment(process.env);
  if (!config.H3_SANDBOX_ENABLED) throw new Error('Enable H3 sandbox explicitly');
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--customer' || !['A', 'B'].includes(args[1])) {
    throw new Error('Usage: npm run sandbox:token -- --customer A|B');
  }
  const customer = args[1] as keyof typeof SANDBOX_CUSTOMERS;
  process.stdout.write(`${issueSandboxToken(SANDBOX_CUSTOMERS[customer], String(config.H3_JWT_SECRET))}\n`);
} catch {
  process.stderr.write('Cannot generate token: check sandbox configuration and --customer A|B\n');
  process.exitCode = 1;
}
