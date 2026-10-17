import {
  requestIdMiddleware,
  REQUEST_ID_HEADER,
  type RequestWithRequestId,
} from './request-id.middleware';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

describe('requestIdMiddleware (correlación X-Request-Id)', () => {
  function run(headers: Record<string, string | string[] | undefined>) {
    const request: RequestWithRequestId = { headers };
    const setHeader = jest.fn();
    const next = jest.fn();
    requestIdMiddleware(request, { setHeader }, next);
    return { request, setHeader, next };
  }

  it('conserva un X-Request-Id válido del consumidor', () => {
    const { request, setHeader, next } = run({
      'x-request-id': 'fe-correlacion-01',
    });
    expect(request.requestId).toBe('fe-correlacion-01');
    expect(setHeader).toHaveBeenCalledWith(
      REQUEST_ID_HEADER,
      'fe-correlacion-01',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('genera un UUID cuando falta el header', () => {
    const { request, setHeader } = run({});
    expect(request.requestId).toMatch(UUID_PATTERN);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, request.requestId);
  });

  it('reemplaza valores inseguros (intentos de inyección de header)', () => {
    const { request } = run({ 'x-request-id': 'valor malicioso\r\nX-Evil: 1' });
    expect(request.requestId).not.toContain('\r');
    expect(request.requestId).toMatch(UUID_PATTERN);
  });

  it('reemplaza valores demasiado largos', () => {
    const { request } = run({ 'x-request-id': 'a'.repeat(65) });
    expect(request.requestId).toMatch(UUID_PATTERN);
  });

  it('usa el primer valor cuando el header viene repetido', () => {
    const { request } = run({ 'x-request-id': ['primero', 'segundo'] });
    expect(request.requestId).toBe('primero');
  });
});
