import { readC001QaSettings } from './c001-qa.service';

describe('C-001 QA configuration', () => {
  const env = {
    C001_QA_ENABLED: 'true',
    BREVO_ENABLED: 'true',
    MAIL_PROVIDER: 'brevo',
    C001_QA_CHECKOUT_OPERATION_ID: 'c0010000-0000-4000-8000-000000000002',
    C001_QA_TO: 'qa@example.org',
    C001_QA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    G1_WEB_ORIGIN: 'https://marketplace.example.org',
  };

  it('requires explicit switches and a valid fenced configuration', () => {
    expect(readC001QaSettings({})).toBeNull();
    expect(readC001QaSettings({ ...env, C001_QA_ENABLED: 'false' })).toBeNull();
    expect(readC001QaSettings({ ...env, BREVO_ENABLED: 'false' })).toBeNull();
    expect(readC001QaSettings(env)).toMatchObject({ operationId: env.C001_QA_CHECKOUT_OPERATION_ID, to: env.C001_QA_TO });
    for (const overrides of [
      { C001_QA_CHECKOUT_OPERATION_ID: '*' },
      { C001_QA_TO: 'invalid' },
      { C001_QA_ENCRYPTION_KEY: '' },
      { G1_WEB_ORIGIN: 'http://marketplace.example.org' },
      { MAIL_PROVIDER: 'mailpit' },
    ]) {
      expect(() => readC001QaSettings({ ...env, ...overrides })).toThrow('C001_QA_CONFIG_INVALID');
    }
  });
});
