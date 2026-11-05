// Integration profile requested by Giuliano. It does not change deployed environment configuration.
export const CATALOG_TIMINGS = Object.freeze({
  standard: Object.freeze({ providerMs: 5000, proxyMs: 8000, checkMs: 11000, providerTargetMs: 5000 }),
  integration: Object.freeze({ providerMs: 15000, proxyMs: 18000, checkMs: 21000, providerTargetMs: 5000 }),
});
export function catalogTimings(profile = 'standard') {
  if (!Object.hasOwn(CATALOG_TIMINGS, profile)) throw new Error('INVALID_TIMING_PROFILE');
  return CATALOG_TIMINGS[profile];
}
