const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/;

export function validateLoopbackOrigin(raw) {
  if (typeof raw !== 'string') {
    throw new Error('PERF_BASE_URL must be an HTTP IP-literal loopback origin.');
  }
  const match = LOOPBACK_ORIGIN.exec(raw);
  const port = match?.[2] ? Number(match[2]) : undefined;
  if (!match || (port !== undefined && (port < 1 || port > 65535))) {
    throw new Error('H5 k6 scripts only allow HTTP on 127.0.0.1 or [::1], with an optional valid port and no path.');
  }
  return `http://${match[1]}${port === undefined ? '' : `:${port}`}`;
}

export function validateMockRun(env) {
  if (env.PERF_MOCK_MODE !== 'true' || env.PERF_RUN_AUTHORIZED !== '1') {
    throw new Error('Set PERF_MOCK_MODE=true and PERF_RUN_AUTHORIZED=1 only for an authorized local MOCK run.');
  }
  return validateLoopbackOrigin(env.PERF_BASE_URL || 'http://127.0.0.1:10000');
}

export function validateAuthenticatedRun(env) {
  const origin = validateMockRun(env);
  const token = env.PERF_ACCESS_TOKEN || '';
  if (!/^[A-Za-z0-9._~-]{16,8192}$/.test(token)) {
    throw new Error('PERF_ACCESS_TOKEN must be a disposable local test token; its value is never logged.');
  }
  return { origin, token };
}

export function loopbackOrigin() {
  return validateMockRun(__ENV);
}

export function authenticatedRun() {
  return validateAuthenticatedRun(__ENV);
}
