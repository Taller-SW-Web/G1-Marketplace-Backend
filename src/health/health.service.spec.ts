import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const config = {
    get: jest.fn().mockReturnValue('test'),
  } as unknown as ConfigService;
  const prisma = {
    $queryRaw: jest.fn(),
    cart: { count: jest.fn() },
    wishlistItem: { count: jest.fn() },
  } as unknown as PrismaService;
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(prisma, config);
  });

  it('reports readiness and existing table counts when the database is available', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    (prisma.cart.count as jest.Mock).mockResolvedValue(2);
    (prisma.wishlistItem.count as jest.Mock).mockResolvedValue(3);

    const result = await service.checkReadiness();

    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({
      status: 'UP',
      environment: 'test',
      database: { connected: true, carts: 2, wishlistItems: 3 },
    });
    expect(result.body.timestamp).toBeDefined();
  });

  it('reports sanitized database failure without leaking the driver error', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(
      new Error('secret connection details'),
    );

    const result = await service.checkReadiness();

    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({
      status: 'DOWN',
      database: { connected: false },
    });
    expect(JSON.stringify(result.body)).not.toContain('secret connection details');
  });
});
