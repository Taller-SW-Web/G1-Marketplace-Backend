import { readC002QaSettings } from './c002-qa.worker';

describe('C-002 QA worker settings', () => {
  const settings = {
    BREVO_ENABLED: 'true',
    MAIL_PROVIDER: 'brevo',
    C002_QA_ENABLED: 'true',
    C002_QA_ORDER_ID: 'PED-2026-00001',
    C002_QA_TO: 'c002-qa@example.org',
    C002_QA_EVENT_AFTER: '2026-11-26T12:00:00Z',
    G1_WEB_ORIGIN: 'https://marketplace.example.org',
  } satisfies NodeJS.ProcessEnv;

  it('starts only when both switches explicitly enable it', () => {
    expect(readC002QaSettings({})).toBeNull();
    expect(readC002QaSettings({ ...settings, C002_QA_ENABLED: 'false' })).toBeNull();
    expect(readC002QaSettings({ ...settings, BREVO_ENABLED: 'false' })).toBeNull();
    expect(readC002QaSettings(settings)).toEqual({
      orderId: settings.C002_QA_ORDER_ID,
      to: settings.C002_QA_TO,
      eventAfter: new Date(settings.C002_QA_EVENT_AFTER),
      webOrigin: settings.G1_WEB_ORIGIN,
    });
  });

  it('requires Brevo and an exact order, recipient, cutoff and HTTPS origin', () => {
    expect(() => readC002QaSettings({ ...settings, MAIL_PROVIDER: 'mailpit' })).toThrow('C002_QA_REQUIRES_BREVO');
    for (const overrides of [
      { C002_QA_ORDER_ID: undefined },
      { C002_QA_ORDER_ID: 'PED-2026-*' },
      { C002_QA_TO: 'invalid' },
      { C002_QA_EVENT_AFTER: '2026-02-30T12:00:00Z' },
      { C002_QA_EVENT_AFTER: '2026-11-26' },
      { G1_WEB_ORIGIN: 'https://marketplace.example.org/mis-pedidos' },
      { G1_WEB_ORIGIN: 'http://marketplace.example.org' },
    ]) {
      expect(() => readC002QaSettings({ ...settings, ...overrides })).toThrow('C002_QA_CONFIG_INVALID');
    }
  });
});
