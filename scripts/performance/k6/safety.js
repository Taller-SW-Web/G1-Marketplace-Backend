const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/;

// Adapted from PR #356 (f8a3986). The BFF itself also needs an isolated Compose network.
export function validateMockRun(env) {
  if (env.PERF_MOCK_MODE !== 'true' || env.PERF_RUN_AUTHORIZED !== '1') {
    throw new Error('A local MOCK run needs PERF_MOCK_MODE=true and PERF_RUN_AUTHORIZED=1.');
  }

  const match = LOOPBACK_ORIGIN.exec(env.PERF_BASE_URL || 'http://127.0.0.1:10000');
  const port = match?.[2] ? Number(match[2]) : 80;
  if (!match || port < 1 || port > 65535) {
    throw new Error('PERF_BASE_URL must be an HTTP loopback origin without a path.');
  }
  return `http://${match[1]}:${port}`;
}
