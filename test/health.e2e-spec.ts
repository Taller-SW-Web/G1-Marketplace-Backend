import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { NotFoundFilter } from '../src/http/not-found.filter';

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  const healthService = {
    checkReadiness: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new NotFoundFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it.each(['/', '/health', '/ready'])('serves readiness at %s', async (path) => {
    healthService.checkReadiness.mockResolvedValue({
      httpStatus: 200,
      body: { status: 'UP' },
    });

    await request(app.getHttpServer())
      .get(path)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('UP'));
  });

  it('serves liveness without checking the database', async () => {
    await request(app.getHttpServer())
      .get('/live')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('UP'));

    expect(healthService.checkReadiness).not.toHaveBeenCalled();
  });

  it('returns service unavailable when readiness fails', async () => {
    healthService.checkReadiness.mockResolvedValue({
      httpStatus: 503,
      body: { status: 'DOWN' },
    });

    await request(app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect(({ body }) => expect(body).toEqual({ status: 'DOWN' }));
  });

  it('keeps the existing not-found response shape', async () => {
    await request(app.getHttpServer())
      .get('/missing-route')
      .expect(404)
      .expect(({ body }) => expect(body).toEqual({ error: 'Ruta no encontrada' }));
  });
});
