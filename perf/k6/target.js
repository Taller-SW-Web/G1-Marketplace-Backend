/**
 * Fail closed unless the target is a local G1 instance or an explicitly
 * allow-listed G1 staging host. External modules must be stubbed by the target
 * deployment before the acknowledgement below is supplied.
 */
export function validateTarget() {
  const raw = __ENV.G1_API_URL;
  if (!raw) throw new Error('G1_API_URL is required.');

  let target;
  try {
    target = new URL(raw);
  } catch {
    throw new Error('G1_API_URL must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('G1_API_URL must be HTTP(S) and must not contain credentials.');
  }

  const local = ['localhost', '127.0.0.1', '::1'].includes(target.hostname);
  const allowedHosts = (__ENV.G1_STAGING_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!local && (!allowedHosts.includes(target.hostname.toLowerCase())
    || __ENV.LOAD_TEST_ACK !== 'g1-owned-staging-with-stubs')) {
    throw new Error('Remote target rejected: allow-list the owned G1 staging host and acknowledge stubbed upstreams.');
  }
  if (__ENV.G1_UPSTREAMS_STUBBED !== 'true') {
    throw new Error('Set G1_UPSTREAMS_STUBBED=true only after verifying G1 uses local stubs for other groups.');
  }

  return target.origin;
}

export function requireEnv(name) {
  const value = __ENV[name];
  if (!value || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}
