import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    cart: { count: jest.fn() },
    wishlistItem: { count: jest.fn() },
  } as unknown as PrismaService;
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(prisma, new ConfigService({ NODE_ENV: 'test' }));
  });

  it('reports readiness without reading business counts', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);
    (prisma.cart.count as jest.Mock).mockResolvedValue(2);
    (prisma.wishlistItem.count as jest.Mock).mockResolvedValue(3);

    const result = await service.checkReadiness();

    expect(result.httpStatus).toBe(200);
    expect(result.body).toEqual({ status: 'UP', service: 'g1-marketplace-backend',
      environment: 'test', database: { connected: true }, timestamp: expect.any(String) });
    expect(new Date(result.body.timestamp).toISOString()).toBe(result.body.timestamp);
    expect(prisma.cart.count).not.toHaveBeenCalled();
    expect(prisma.wishlistItem.count).not.toHaveBeenCalled();
  });

  it('reports sanitized database failure without leaking the driver error', async () => {
    (prisma.$queryRaw as jest.Mock).mockRejectedValue(
      new Error('secret connection details'),
    );

    const result = await service.checkReadiness();

    expect(result.httpStatus).toBe(503);
    expect(result.body).toEqual({ status: 'DOWN', service: 'g1-marketplace-backend',
      environment: 'test', database: { connected: false }, timestamp: expect.any(String) });
    expect(prisma.cart.count).not.toHaveBeenCalled();
    expect(prisma.wishlistItem.count).not.toHaveBeenCalled();
    expect(JSON.stringify(result.body)).not.toContain('secret connection details');
  });
});
