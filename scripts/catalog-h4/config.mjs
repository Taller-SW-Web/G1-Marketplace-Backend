import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);

/** Calls the actual provider constructor, with a transport that cannot make a request. No env values are printed. */
export function inspectCatalogConfig(env = process.env) {
  const { createProvider, CONTRACT_SHA, CONTRACT_VERSION } = require('../../dist/catalog/provider.js');
  let source = 'UNCONFIGURED';
  try { source = createProvider(env, async () => { throw new Error('CONFIG_CHECK_MUST_NOT_REQUEST'); }).source; }
  catch { /* Invalid configuration is reported without serializing its exception or values. */ }
  const timeout = Number(env.PRODUCTOS_TIMEOUT_MS ?? 5000);
  return { source, providerConstructorAccepted: source !== 'UNCONFIGURED',
    checks: {
      realSourceSelected: env.CATALOG_SOURCE === 'real', mockSourceSelected: env.CATALOG_SOURCE === 'mock',
      integrationFlagSet: env.CATALOG_INTEGRATION_APPROVED === 'true', baseUrlPresent: !!env.PRODUCTOS_BASE_URL,
      serviceTokenPresent: !!env.PRODUCTOS_SERVICE_TOKEN, demoNoAuthSelected: env.PRODUCTOS_AUTH_MODE === 'demo-no-auth',
      contractPinMatches: env.PRODUCTOS_CONTRACT_VERSION === CONTRACT_VERSION && env.PRODUCTOS_CONTRACT_SHA === CONTRACT_SHA,
      mediaAllowlistPresent: !!env.PRODUCTOS_MEDIA_HOSTS, featuredEnabled: env.CATALOG_FEATURED_ENABLED === 'true',
      featuredApprovalFlagSet: env.CATALOG_FEATURED_APPROVED === 'true', featuredIdsPresent: !!env.CATALOG_FEATURED_IDS,
      homeFallbackEnabled: env.CATALOG_HOME_FALLBACK_ENABLED === 'true',
    },
    effectiveProviderBudgetMs: Number.isInteger(timeout) && timeout >= 100 && timeout <= 30000 ? timeout : null,
    salesRankingAdapterVerified: false, grantVerified: false, approvalVerified: false, deployedShaVerified: false,
    limits: 'Offline configuration check only. Token presence is not validity or grant. Approval flags are not independent acceptance. No HTTP or database calls.' };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw new Error('INVALID_CONFIG_ARGUMENTS');
    const result = inspectCatalogConfig(); console.log(JSON.stringify(result, null, 2));
    if (!result.providerConstructorAccepted) process.exitCode = 2;
  } catch { console.error(JSON.stringify({ status: 'FAIL', code: 'CONFIG_CHECK_REQUIRES_BUILD' })); process.exitCode = 1; }
}
