export const G5_FIXTURE_ENV = 'CHECKOUT_G5_TEST_FIXTURE';

export interface G5CheckoutFixture {
  customerId: string;
  sku: string;
  productId: string;
  unitPriceCents: number;
  shippingCents: number;
  paymentMethod: string;
  expiresAt: string;
}

export function parseG5CheckoutFixture(raw: unknown): G5CheckoutFixture | undefined {
  if (raw === undefined || raw === '') return undefined;
  const invalid = () => new Error(`${G5_FIXTURE_ENV} must contain a valid, bounded checkout test fixture`);
  if (typeof raw !== 'string' || raw.length > 1024) throw invalid();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw invalid(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const { customerId, sku, productId, unitPriceCents, shippingCents, paymentMethod, expiresAt } = value as Record<string, unknown>;
  const label = (s: unknown, max: number): s is string => typeof s === 'string' &&
    s.length <= max && /^[a-z0-9][a-z0-9._-]*$/iu.test(s);
  const cents = (n: unknown, min: number): n is number => typeof n === 'number' &&
    Number.isSafeInteger(n) && n >= min && n <= 1_000_000;
  if (Object.keys(value).length !== 7 ||
      typeof customerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(customerId) ||
      !label(sku, 100) || !label(productId, 100) || !label(paymentMethod, 64) ||
      !cents(unitPriceCents, 1) || !cents(shippingCents, 0) || typeof expiresAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(expiresAt)) throw invalid();
  const expiry = new Date(expiresAt);
  if (!Number.isFinite(expiry.valueOf()) || expiry.toISOString() !== expiresAt) throw invalid();
  return { customerId, sku, productId, unitPriceCents, shippingCents, paymentMethod, expiresAt };
}
