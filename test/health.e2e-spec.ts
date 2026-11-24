import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { configureApp } from '../src/http/configure-app';
import { NotFoundFilter } from '../src/http/not-found.filter';

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  let accessLogSpy: jest.SpyInstance;
  const healthService = {
    checkReadiness: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: healthService },
        { provide: ConfigService, useValue: { get: () => [] } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    accessLogSpy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    configureApp(app);
    app.useGlobalFilters(new NotFoundFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    accessLogSpy.mockRestore();
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
      .set('X-Request-Id', 'health-log-test-01')
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('UP'));

    expect(healthService.checkReadiness).not.toHaveBeenCalled();
    const accessEvent = accessLogSpy.mock.calls
      .map(([message, context]) => ({ message, context }))
      .filter(({ context }) => context === 'HttpAccess')
      .map(({ message }) => JSON.parse(message as string))
      .find(({ requestId }) => requestId === 'health-log-test-01');
    expect(accessEvent).toMatchObject({
      event: 'http_access',
      requestId: 'health-log-test-01',
      method: 'GET',
      route: '/live',
      status: 200,
    });
    expect(accessEvent.elapsedMs).toEqual(expect.any(Number));
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
      .set('X-Request-Id', 'health-missing-log-01')
      .expect(404)
      .expect(({ body }) => expect(body).toEqual({ error: 'Ruta no encontrada' }));

    const accessEvent = accessLogSpy.mock.calls
      .map(([message, context]) => ({ message, context }))
      .filter(({ context }) => context === 'HttpAccess')
      .map(({ message }) => JSON.parse(message as string))
      .find(({ requestId }) => requestId === 'health-missing-log-01');
    expect(accessEvent).toMatchObject({
      event: 'http_access',
      requestId: 'health-missing-log-01',
      method: 'GET',
      route: 'UNMATCHED',
      status: 404,
    });
  });
});
