import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CsatModule } from '../src/csat/csat.module';
import { CsatService } from '../src/csat/csat.service';
import { CsatGateway } from '../src/csat/csat.gateway';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabase } from '../scripts/test-database';
import { SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';
import { ApiError } from '../src/http/api-error';

if (process.env.H3_ALLOW_TEST_DATABASE_WRITES !== 'true' || process.env.NODE_ENV !== 'test'
  || process.env.DATABASE_URL !== validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL })) {
  throw new Error('Use the isolated PostgreSQL runner');
}

describe('CSAT PostgreSQL prompt persistence (MOCK Sales and identity)', () => {
  let prisma: PrismaService;
  let service: CsatService;
  let module: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
  const submit = jest.fn(async () => {});
  const orderId = 'PED-2026-99999';
  const customerId = SANDBOX_CUSTOMERS.A;
  const where = { customerId_externalOrderId: { customerId, externalOrderId: orderId } };
  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true,
      ignoreEnvFile: true, ignoreEnvVars: true, load: [() => ({ CSAT_ENABLED: 'true',
        CSAT_INTEGRATION_APPROVED: 'true', CSAT_PROMPT_APPROVED: 'true' })] }), CsatModule] })
      .overrideProvider(CsatGateway).useValue({ assertDelivered: jest.fn(async () => {}), submit }).compile();
    prisma = module.get(PrismaService); service = module.get(CsatService);
    await prisma.$connect();
  });
  beforeEach(async () => {
    submit.mockReset(); submit.mockResolvedValue(undefined);
    await prisma.postDeliveryPrompt.deleteMany({ where: { customerId, externalOrderId: orderId } });
    await prisma.postDeliveryPrompt.create({ data: { customerId, externalOrderId: orderId,
      deliveryConfirmedAt: new Date('2026-01-01'), eligibleAt: new Date('2026-01-01'),
      state: 'SHOWN', shownAt: new Date('2026-01-02') } });
  });
  afterAll(async () => {
    await prisma?.postDeliveryPrompt.deleteMany({ where: { customerId, externalOrderId: orderId } });
    await prisma?.$disconnect(); await module?.close();
  });
  it('persists only confirmed submission and rejects duplicate without contacting Sales', async () => {
    await service.submit(customerId, orderId, 'synthetic', { sentiment: 'GOOD' });
    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({ state: 'SUBMITTED', submittedAt: expect.any(Date) });
    await expect(service.submit(customerId, orderId, 'synthetic', { sentiment: 'GOOD' })).rejects.toMatchObject({ status: 409 });
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('preserves state on uncertain mutation and reconciles provider duplicate on manual retry', async () => {
    submit.mockRejectedValueOnce(new ApiError(503, 'SALES_UNAVAILABLE', 'Uncertain'));
    await expect(service.submit(customerId, orderId, 'synthetic', { sentiment: 'BAD' })).rejects.toMatchObject({ status: 503 });
    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({ state: 'SHOWN', submittedAt: null });
    submit.mockRejectedValueOnce(new ApiError(409, 'CSAT_ALREADY_SUBMITTED', 'Duplicate'));
    await expect(service.submit(customerId, orderId, 'synthetic', { sentiment: 'BAD' })).rejects.toMatchObject({ status: 409 });
    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({ state: 'SUBMITTED' });
  });
  it('enforces owner/order uniqueness and rolls back a failed transaction', async () => {
    await expect(prisma.postDeliveryPrompt.create({ data: { customerId, externalOrderId: orderId,
      deliveryConfirmedAt: new Date() } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.$transaction(async tx => {
      await tx.postDeliveryPrompt.update({ where, data: { state: 'DISMISSED', dismissedAt: new Date() } });
      throw new Error('rollback-fixture');
    })).rejects.toThrow('rollback-fixture');
    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({ state: 'SHOWN' });
    await expect(service.submit(SANDBOX_CUSTOMERS.B, orderId, 'synthetic', { sentiment: 'GOOD' })).rejects.toMatchObject({ status: 409 });
    expect(submit).not.toHaveBeenCalled();
  });

  it('reconciles concurrent submissions through authoritative provider uniqueness', async () => {
    let arrived = 0;
    let release!: () => void;
    const bothArrived = new Promise<void>(resolve => { release = resolve; });
    submit.mockImplementation(async () => {
      const requestNumber = ++arrived;
      if (arrived === 2) release();
      await bothArrived;
      if (requestNumber === 2) throw new ApiError(409, 'CSAT_ALREADY_SUBMITTED', 'Duplicate');
    });
    const results = await Promise.allSettled([service.submit(customerId, orderId, 'synthetic', { sentiment: 'GOOD' }),
      service.submit(customerId, orderId, 'synthetic', { sentiment: 'GOOD' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(await prisma.postDeliveryPrompt.findUnique({ where })).toMatchObject({ state: 'SUBMITTED',
      submittedAt: expect.any(Date), dismissedAt: null, shownAt: new Date('2026-01-02') });
  });
});
