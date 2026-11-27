import { orderPollMaxMs } from './checkout.service';

describe('orderPollMaxMs', () => {
  it('keeps the 60 s window when the variable is absent or empty', () => {
    expect(orderPollMaxMs({})).toBe(60_000);
    expect(orderPollMaxMs({ G5_ORDER_POLL_MAX_MS: '' })).toBe(60_000);
  });

  it('accepts a shorter window so the BFF answers 202 before the frontend proxy deadline', () => {
    expect(orderPollMaxMs({ G5_ORDER_POLL_MAX_MS: '15000' })).toBe(15_000);
    expect(orderPollMaxMs({ G5_ORDER_POLL_MAX_MS: '1000' })).toBe(1_000);
    expect(orderPollMaxMs({ G5_ORDER_POLL_MAX_MS: '60000' })).toBe(60_000);
  });

  it.each(['abc', '999', '60001', '-5', '15.5', 'NaN'])('falls back to 60 s for the invalid value %s', (value) => {
    expect(orderPollMaxMs({ G5_ORDER_POLL_MAX_MS: value })).toBe(60_000);
  });
});
