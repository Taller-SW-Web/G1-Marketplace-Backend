import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../security/auth.guard';
import { issueSandboxToken, SANDBOX_CUSTOMERS } from './sandbox-token';

describe('Shared identity sandbox restrictions', () => {
  const secret = 'shared-identity-test-only-secret-longer-than-32-bytes';
  const authentication = (enabled: boolean, environment: string) => new AuthGuard({
    get: (key: string, fallback: unknown) => ({ H3_SANDBOX_ENABLED: enabled, NODE_ENV: environment } as Record<string, unknown>)[key] ?? fallback,
    getOrThrow: () => secret,
  } as unknown as ConfigService);

  it('shares only verified sandbox UUID subjects', async () => {
    await expect(authentication(true, 'test').authenticate(issueSandboxToken(SANDBOX_CUSTOMERS.A, secret)))
      .resolves.toEqual({ sub: SANDBOX_CUSTOMERS.A });
    await expect(authentication(true, 'test').authenticate(issueSandboxToken(SANDBOX_CUSTOMERS.A, `${secret}tampered`)))
      .rejects.toMatchObject({ status: 401 });
  });
  it.each([[false, 'test'], [true, 'production']])('fails closed for enabled=%s, environment=%s', async (enabled, environment) => {
    await expect(authentication(Boolean(enabled), String(environment)).authenticate(issueSandboxToken(SANDBOX_CUSTOMERS.A, secret)))
      .rejects.toMatchObject({ status: 401 });
  });
  it('does not silently default missing RS256 authentication configuration to localhost', async () => {
    const guard = new AuthGuard({ get: () => undefined } as unknown as ConfigService);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key' })).toString('base64url');
    await expect(guard.authenticate(`${header}.payload.signature`)).rejects.toMatchObject({ status: 503 });
  });
});
