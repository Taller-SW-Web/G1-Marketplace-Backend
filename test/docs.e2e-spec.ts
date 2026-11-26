import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DocsController } from '../src/docs/docs.controller';
import { NotFoundFilter } from '../src/http/not-found.filter';

describe('DocsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocsController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new NotFoundFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the Swagger UI page', async () => {
    const response = await request(app.getHttpServer()).get('/docs').expect(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('SwaggerUIBundle');
    // 'urls' solo se interpreta con el preset standalone y su barra superior; sin ellos Swagger muestra «No API definition provided».
    expect(response.text).toContain('SwaggerUIStandalonePreset');
    expect(response.text).toContain("layout: 'StandaloneLayout'");
  });

  it('lists the published contracts', async () => {
    const { body } = await request(app.getHttpServer()).get('/docs/specs').expect(200);
    const urls = (body as Array<{ url: string }>).map((spec) => spec.url);
    expect(urls).toContain('/docs/specs/checkout-h4.openapi.yaml');
    expect(urls).toContain('/docs/specs/openapi-catalogo-h4.json');
    expect(urls.every((url) => /\.(ya?ml|json)$/.test(url))).toBe(true);
  });

  it('serves a YAML contract with its media type', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs/specs/checkout-h4.openapi.yaml')
      .expect(200);
    expect(response.headers['content-type']).toContain('application/yaml');
    expect(response.text).toContain('openapi: 3.0.3');
  });

  it('serves a JSON contract with its media type', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs/specs/openapi-catalogo-h4.json')
      .expect(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(JSON.parse(response.text).openapi).toBeDefined();
  });

  it.each([
    '/docs/specs/..%2Fpackage.json',
    '/docs/specs/h3-favoritos.md',
    '/docs/specs/no-existe.yaml',
    '/docs/specs/%2e%2e%2f%2e%2e%2fpackage.json',
  ])('does not serve %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(404);
  });
});
