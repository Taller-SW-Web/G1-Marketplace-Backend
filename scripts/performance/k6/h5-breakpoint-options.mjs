const levels = ['400', '800', '1000'];
const spikeLevels = ['200', '400', '800', '1000'];

export function breakpointOptions(env) {
  const mode = env.PERF_CASE;
  const allowed = mode === 'stress' ? levels : mode === 'spike' ? spikeLevels : mode === 'soak' ? ['10', '20'] : [];
  if (!allowed.includes(env.PERF_VUS)) throw new Error('Choose an allowed PERF_CASE and PERF_VUS for this local run.');
  const target = Number(env.PERF_VUS);
  const measured = (duration) => ({ executor: 'constant-vus', vus: target, duration, gracefulStop: '5s' });
  const ramp = (startVUs, stages) => ({ executor: 'ramping-vus', startVUs, stages, gracefulRampDown: '5s', gracefulStop: '5s' });
  const scenarios = mode === 'stress'
    ? { approach: ramp(0, [{ duration: '15s', target }]), measured: { ...measured('30s'), startTime: '20s' } }
    : mode === 'spike'
      ? { measured: ramp(10, [{ duration: '1m', target: 10 }, { duration: '5s', target }, { duration: '55s', target }, { duration: '10s', target: 10 }, { duration: '2m50s', target: 10 }]) }
      : { measured: measured('5m') };
  return {
    discardResponseBodies: true,
    scenarios,
    summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
    thresholds: {
      'http_req_duration{scenario:measured}': ['p(95)<=500'],
      'http_req_failed{scenario:measured}': ['rate<=0.01'],
      'h5_request_success{scenario:measured}': ['rate>=0.99'],
    },
  };
}
