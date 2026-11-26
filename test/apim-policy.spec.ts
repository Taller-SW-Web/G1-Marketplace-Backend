import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Azure APIM policy configuration (BE #312 / TASK-H5-APIM-007)', () => {
  const policyPath = join(__dirname, '..', 'azure-apim', 'policies', 'api-policy.xml');
  const xml = readFileSync(policyPath, 'utf8');

  it('configures X-Correlation-Id propagation in inbound, outbound and on-error', () => {
    expect(xml).toContain('<set-header name="X-Correlation-Id" exists-action="skip">');
    expect(xml).toContain('<set-header name="X-Correlation-Id" exists-action="override">');
    expect(xml).toContain('<header>X-Correlation-Id</header>');
    expect(xml).toContain('<on-error>');
  });

  it('enforces 60 req/min subscription rate-limit returning 429 with Retry-After', () => {
    expect(xml).toContain('<rate-limit calls="60" renewal-period="60" retry-after-header-name="Retry-After" />');
    expect(xml).toContain('<header>Retry-After</header>');
  });

  it('validates G7 RS256 JWT on protected routes (401) while keeping public paths open', () => {
    expect(xml).toContain('failed-validation-httpcode="401"');
    expect(xml).toContain('https://g7-auth-service.onrender.com/api/v1/auth/.well-known/openid-configuration');
    expect(xml).toContain('Contains("/health")');
    expect(xml).toContain('Contains("/docs")');
    expect(xml).toContain('Contains("/catalog")');
  });
});
