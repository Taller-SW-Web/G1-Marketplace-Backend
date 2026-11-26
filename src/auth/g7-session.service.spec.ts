import { ConfigService } from '@nestjs/config';
import { ApiError } from '../http/api-error';
import { AuthGuard } from '../security/auth.guard';
import { G7Client } from './g7.client';
import { G7SessionService } from './g7-session.service';
import { SessionStore, StoredSession } from './session.store';

describe('G7SessionService OTP recovery', () => {
  const origin = 'https://marketplace.example.test';
  const request = { headers: { origin, cookie: '__Host-g1_challenge=fixture' } };
  const response = { append: jest.fn() };
  const session: StoredSession = {
    id: 'fixture', expiresAt: new Date(Date.now() + 300000),
    data: { kind: 'challenge', challengeToken: 'fixture-challenge' },
  };
  const config = { get: jest.fn((key: string) => ({ AUTH_ENABLED: 'true', G1_WEB_ORIGIN: origin } as Record<string, string>)[key]) };

  it.each([
    [410, 'OTP_EXPIRADO'],
    [401, 'OTP_INTENTOS_AGOTADOS'],
    [401, 'CODIGO_INVALIDO'],
  ])('retains the challenge after %s %s so a new code can be requested', async (status, code) => {
    let removed = false;
    const store = { locked: jest.fn(async (_cookie, operation) => {
      const change = await operation(session);
      removed = Boolean(change.remove);
      return change.result;
    }) };
    const provider = { call: jest.fn().mockRejectedValue(new ApiError(status, code, 'Fixture error')) };
    const service = new G7SessionService(config as unknown as ConfigService, provider as unknown as G7Client,
      store as unknown as SessionStore, {} as AuthGuard);
    await expect(service.otp(request, response, '123456')).rejects.toMatchObject({ status });
    expect(removed).toBe(false);
  });

  it('removes the challenge after G7 rejects the challenge token', async () => {
    let removed = false;
    const store = { locked: jest.fn(async (_cookie, operation) => {
      const change = await operation(session);
      removed = Boolean(change.remove);
      return change.result;
    }) };
    const provider = { call: jest.fn().mockRejectedValue(new ApiError(401, 'TOKEN_INVALIDO', 'Fixture error')) };
    const service = new G7SessionService(config as unknown as ConfigService, provider as unknown as G7Client,
      store as unknown as SessionStore, {} as AuthGuard);
    await expect(service.otp(request, response, '123456')).rejects.toMatchObject({ status: 401 });
    expect(removed).toBe(true);
  });
});
