import { corsOptions } from './cors-options';

describe('corsOptions', () => {
  it('allows credentials only from the explicitly configured origins', () => {
    expect(corsOptions(['http://localhost:3000'])).toEqual({
      origin: ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'x-customer-id'],
    });
  });

  it('keeps CORS disabled when no origins are configured', () => {
    expect(corsOptions([]).origin).toBe(false);
  });
});
