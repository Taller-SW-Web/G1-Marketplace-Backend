import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiError } from '../http/api-error';
import { SubmitCsatDto } from './csat.dto';
import { CsatGateway } from './csat.gateway';
import { CsatService } from './csat.service';

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    CSAT_ENABLED: 'true',
    CSAT_INTEGRATION_APPROVED: 'true',
    CSAT_PROMPT_APPROVED: 'true',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('CsatService and SubmitCsatDto (F-040)', () => {
  const past = new Date(Date.now() - 60_000);

  it('throws 503 CSAT_UNAVAILABLE when any CSAT gate flag is disabled', async () => {
    for (const flag of ['CSAT_ENABLED', 'CSAT_INTEGRATION_APPROVED', 'CSAT_PROMPT_APPROVED']) {
      const prisma = { postDeliveryPrompt: { findUnique: jest.fn(), updateMany: jest.fn() } };
      const sales = { assertDelivered: jest.fn(), submit: jest.fn() } as unknown as CsatGateway;
      const service = new CsatService(makeConfig({ [flag]: 'false' }), prisma as never, sales);

      await expect(service.submit('cust-1', 'PED-2026-00001', 'tok', { sentiment: 'GOOD' }))
        .rejects.toMatchObject({ status: 503, response: { code: 'CSAT_UNAVAILABLE' } });
      expect(prisma.postDeliveryPrompt.findUnique).not.toHaveBeenCalled();
    }
  });

  it('throws 409 PROMPT_NOT_ELIGIBLE when prompt is missing, dismissed, or has invalid timestamps', async () => {
    const sales = { assertDelivered: jest.fn(), submit: jest.fn() } as unknown as CsatGateway;
    const cases = [
      null,
      { state: 'DISMISSED', deliveryConfirmedAt: past, shownAt: past },
      { state: 'SHOWN', deliveryConfirmedAt: past, shownAt: null },
      { state: 'SHOWN', deliveryConfirmedAt: past, shownAt: new Date(Date.now() + 60_000) },
      { state: 'SHOWN', deliveryConfirmedAt: new Date('invalid'), shownAt: past },
    ];
    for (const prompt of cases) {
      const prisma = { postDeliveryPrompt: { findUnique: jest.fn(async () => prompt), updateMany: jest.fn() } };
      const service = new CsatService(makeConfig(), prisma as never, sales);
      await expect(service.submit('cust-1', 'PED-2026-00001', 'tok', { sentiment: 'GOOD' }))
        .rejects.toMatchObject({ status: 409, response: { code: 'PROMPT_NOT_ELIGIBLE' } });
    }
  });

  it('throws 409 CSAT_ALREADY_SUBMITTED when prompt state is already SUBMITTED', async () => {
    const prisma = {
      postDeliveryPrompt: {
        findUnique: jest.fn(async () => ({ state: 'SUBMITTED', deliveryConfirmedAt: past, shownAt: past })),
        updateMany: jest.fn(),
      },
    };
    const sales = { assertDelivered: jest.fn(), submit: jest.fn() } as unknown as CsatGateway;
    const service = new CsatService(makeConfig(), prisma as never, sales);

    await expect(service.submit('cust-1', 'PED-2026-00001', 'tok', { sentiment: 'REGULAR' }))
      .rejects.toMatchObject({ status: 409, response: { code: 'CSAT_ALREADY_SUBMITTED' } });
    expect(sales.assertDelivered).not.toHaveBeenCalled();
  });

  it('maps sentiment to 5/3/1, formats reasons and comment, and marks prompt SUBMITTED', async () => {
    const prisma = {
      postDeliveryPrompt: {
        findUnique: jest.fn(async () => ({ state: 'SHOWN', deliveryConfirmedAt: past, shownAt: past })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const sales = {
      assertDelivered: jest.fn(async () => undefined),
      submit: jest.fn(async () => undefined),
    };
    const service = new CsatService(makeConfig(), prisma as never, sales as unknown as CsatGateway);

    await service.submit('cust-1', 'PED-2026-00001', 'token-abc', {
      sentiment: 'BAD',
      reasons: ['RETRASO', 'EMPAQUE'],
      comment: '  Llegó golpeado  ',
    });

    expect(sales.assertDelivered).toHaveBeenCalledWith('PED-2026-00001', 'cust-1', 'token-abc');
    expect(sales.submit).toHaveBeenCalledWith(
      {
        pedidoId: 'PED-2026-00001',
        clienteId: 'cust-1',
        canal: 'MARKETPLACE',
        puntuacion: 1,
        comentario: 'Motivos: [RETRASO, EMPAQUE] - Llegó golpeado',
      },
      'token-abc',
    );
    expect(prisma.postDeliveryPrompt.updateMany).toHaveBeenCalledTimes(1);
  });

  it('reconciles duplicate 409 CSAT_ALREADY_SUBMITTED from gateway by marking local prompt SUBMITTED', async () => {
    const prisma = {
      postDeliveryPrompt: {
        findUnique: jest.fn(async () => ({ state: 'SHOWN', deliveryConfirmedAt: past, shownAt: past })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const sales = {
      assertDelivered: jest.fn(async () => undefined),
      submit: jest.fn(async () => {
        throw new ApiError(409, 'CSAT_ALREADY_SUBMITTED', 'Ya registrada');
      }),
    };
    const service = new CsatService(makeConfig(), prisma as never, sales as unknown as CsatGateway);

    await expect(service.submit('cust-1', 'PED-2026-00001', 'token-abc', { sentiment: 'GOOD' }))
      .rejects.toMatchObject({ status: 409, response: { code: 'CSAT_ALREADY_SUBMITTED' } });
    expect(prisma.postDeliveryPrompt.updateMany).toHaveBeenCalledTimes(1);
  });

  it('leaves local prompt unchanged when gateway fails with a transient 503 error', async () => {
    const prisma = {
      postDeliveryPrompt: {
        findUnique: jest.fn(async () => ({ state: 'SHOWN', deliveryConfirmedAt: past, shownAt: past })),
        updateMany: jest.fn(),
      },
    };
    const sales = {
      assertDelivered: jest.fn(async () => undefined),
      submit: jest.fn(async () => {
        throw new ApiError(503, 'SALES_UNAVAILABLE', 'Temporalmente no disponible');
      }),
    };
    const service = new CsatService(makeConfig(), prisma as never, sales as unknown as CsatGateway);

    await expect(service.submit('cust-1', 'PED-2026-00001', 'token-abc', { sentiment: 'REGULAR' }))
      .rejects.toMatchObject({ status: 503, response: { code: 'SALES_UNAVAILABLE' } });
    expect(prisma.postDeliveryPrompt.updateMany).not.toHaveBeenCalled();
  });

  it('validates SubmitCsatDto fields including reason pattern and control characters', async () => {
    const valid = plainToInstance(SubmitCsatDto, {
      sentiment: 'GOOD',
      reasons: ['ENTREGA_RAPIDA'],
      comment: 'Todo bien',
    });
    expect(await validate(valid)).toHaveLength(0);

    const invalid = plainToInstance(SubmitCsatDto, {
      sentiment: 'EXCELLENT',
      reasons: ['bad-reason'],
      comment: 'hola\u0007',
    });
    const errors = await validate(invalid);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
