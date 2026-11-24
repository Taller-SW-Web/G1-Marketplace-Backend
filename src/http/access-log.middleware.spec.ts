import {
  createAccessLogMiddleware,
  type AccessLogRequest,
  type AccessLogResponse,
} from './access-log.middleware';

describe('accessLogMiddleware', () => {
  function run(request: AccessLogRequest & { url?: string }) {
    const listeners: Array<() => void> = [];
    const response: AccessLogResponse = {
      statusCode: 200,
      on: jest.fn((event, listener) => {
        expect(event).toBe('finish');
        listeners.push(listener);
        return response;
      }),
    };
    const writeLog = jest.fn();
    const next = jest.fn();
    createAccessLogMiddleware(writeLog)(request, response, next);
    return { listeners, response, writeLog, next };
  }

  it('logs a correlated route template and status after the response finishes', () => {
    const { listeners, response, writeLog, next } = run({
      method: 'GET',
      requestId: 'matrix-F-001',
      route: { path: '/api/v1/catalog/products/:slug' },
      url: '/api/v1/catalog/products/product-123?email=private@example.test',
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(writeLog).not.toHaveBeenCalled();
    response.statusCode = 200;
    listeners[0]();

    expect(writeLog).toHaveBeenCalledTimes(1);
    const event = JSON.parse(writeLog.mock.calls[0][0] as string);
    expect(event).toMatchObject({
      event: 'http_access',
      requestId: 'matrix-F-001',
      method: 'GET',
      route: '/api/v1/catalog/products/:slug',
      status: 200,
    });
    expect(event.elapsedMs).toEqual(expect.any(Number));
    expect(JSON.stringify(event)).not.toContain('product-123');
    expect(JSON.stringify(event)).not.toContain('private@example.test');
  });

  it('does not expose an unmatched raw path or query string', () => {
    const { listeners, writeLog } = run({
      method: 'POST',
      requestId: 'safe-404',
      url: '/api/v1/missing/customer@example.test?token=secret',
    });
    listeners[0]();

    const event = JSON.parse(writeLog.mock.calls[0][0] as string);
    expect(event).toMatchObject({ method: 'POST', route: 'UNMATCHED', status: 200 });
    expect(JSON.stringify(event)).not.toContain('customer@example.test');
    expect(JSON.stringify(event)).not.toContain('secret');
  });

  it('uses safe fallbacks for missing correlation, unsupported route shapes, and invalid status', () => {
    const { listeners, response, writeLog } = run({
      method: 'GET\r\nX-Evil: 1',
      requestId: 'unsafe\r\nid',
      route: { path: ['/health', '/ready'] },
    });
    response.statusCode = Number.NaN;
    listeners[0]();

    expect(JSON.parse(writeLog.mock.calls[0][0] as string)).toMatchObject({
      requestId: 'unknown',
      method: 'OTHER',
      route: 'UNMATCHED',
      status: 0,
    });
  });

  it('does not fail the request if the log sink throws', () => {
    const listeners: Array<() => void> = [];
    const next = jest.fn();
    const response: AccessLogResponse = {
      statusCode: 500,
      on: (_event, listener) => { listeners.push(listener); return response; },
    };
    createAccessLogMiddleware(() => { throw new Error('log sink unavailable'); })(
      { method: 'GET', requestId: 'safe-id', route: { path: '/health' } },
      response,
      next,
    );

    expect(() => listeners[0]()).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
