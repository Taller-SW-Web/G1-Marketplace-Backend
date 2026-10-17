import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';

describe('F-002 H3 mock login (e2e)', () => {
  let app: INestApplication;
  const config = { H3_AUTH_MOCK: 'true', NODE_ENV: 'test' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: ConfigService, useValue: { get: (key: string) => config[key as keyof typeof config] } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('returns a clearly labelled mock result without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'demo@inka.test', contrasena: 'Hito3Demo!' })
      .expect(200)
      .expect(({ body, headers }) => {
        expect(body).toMatchObject({ mode: 'MOCK', authenticated: false });
        expect(body).not.toHaveProperty('token');
        expect(headers['set-cookie']).toBeUndefined();
      });
  });

  it('uses one neutral error for either wrong credential', async () => {
    const emailError = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'other@inka.test', contrasena: 'Hito3Demo!' })
      .expect(401);
    const passwordError = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'demo@inka.test', contrasena: 'incorrecta' })
      .expect(401);
    expect(emailError.body).toEqual(passwordError.body);
  });

  it('validates input before calling the mock adapter', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'no-es-correo', contrasena: '' })
      .expect(400);
  });

  it('is disabled unless explicitly enabled outside production', async () => {
    config.H3_AUTH_MOCK = 'false';
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'demo@inka.test', contrasena: 'Hito3Demo!' })
      .expect(503);
    config.H3_AUTH_MOCK = 'true';
    config.NODE_ENV = 'production';
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'demo@inka.test', contrasena: 'Hito3Demo!' })
      .expect(503);
    config.NODE_ENV = 'test';
  });
});
