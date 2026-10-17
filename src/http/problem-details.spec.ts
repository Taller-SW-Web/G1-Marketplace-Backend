import { buildProblemDetails, problemTitle, problemType } from './problem-details';

describe('problem-details (sobre RFC 9457 del contrato F-011 §4)', () => {
  it('problemType convierte el código a kebab-case bajo la base del contrato', () => {
    expect(problemType('PRODUCT_NOT_AVAILABLE')).toBe(
      'https://marketplace.example.com/problems/product-not-available',
    );
  });

  it('problemTitle resuelve los códigos del contrato y cae a un título genérico', () => {
    expect(problemTitle('PRODUCT_CATALOG_TIMEOUT')).toBe(
      'El catálogo tardó demasiado en responder.',
    );
    expect(problemTitle('CODIGO_DESCONOCIDO')).toBe(
      'No pudimos procesar la solicitud.',
    );
  });

  it('buildProblemDetails incluye los 6 campos del formato uniforme', () => {
    const problem = buildProblemDetails({
      status: 404,
      code: 'PRODUCT_NOT_AVAILABLE',
      instance: '/api/v1/catalog/products/zapatillas-running-aero-x',
      requestId: '0f873b84-ae5d-4cd2-a530-f88672e4af85',
    });

    expect(problem).toEqual({
      type: 'https://marketplace.example.com/problems/product-not-available',
      title: 'Producto no disponible',
      status: 404,
      code: 'PRODUCT_NOT_AVAILABLE',
      instance: '/api/v1/catalog/products/zapatillas-running-aero-x',
      requestId: '0f873b84-ae5d-4cd2-a530-f88672e4af85',
    });
  });

  it('omite `detail` cuando no hay mensaje propio', () => {
    const problem = buildProblemDetails({
      status: 503,
      code: 'PRODUCT_CATALOG_UNAVAILABLE',
      instance: '/api/v1/catalog/products/x',
      requestId: 'req-1',
    });
    expect('detail' in problem).toBe(false);
  });

  it('incluye `detail` cuando el mensaje es propio de Marketplace', () => {
    const problem = buildProblemDetails({
      status: 400,
      code: 'INVALID_PRODUCT_SLUG',
      instance: '/api/v1/catalog/products/X',
      requestId: 'req-2',
      detail: 'El slug tiene formato inválido',
    });
    expect(problem.detail).toBe('El slug tiene formato inválido');
  });
});
