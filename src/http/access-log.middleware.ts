import { Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/u;
const SAFE_METHOD = /^[A-Z]{1,16}$/u;

export interface AccessLogRequest {
  method?: string;
  requestId?: string;
  route?: { path?: unknown };
}

export interface AccessLogResponse {
  statusCode?: number;
  on(event: 'finish', listener: () => void): unknown;
}

export type AccessLogWriter = (message: string) => void;

function routeTemplate(request: AccessLogRequest): string {
  const path = request.route?.path;
  return typeof path === 'string' && path.startsWith('/') && path.length <= 256
    ? path
    : 'UNMATCHED';
}

/**
 * Emit one structured access event per completed HTTP request. Only the
 * router's static path template is logged; raw URLs, query strings, headers,
 * and request/response bodies are deliberately excluded.
 */
export function createAccessLogMiddleware(
  writeLog: AccessLogWriter = (message) => Logger.log(message, 'HttpAccess'),
) {
  return (
    request: AccessLogRequest,
    response: AccessLogResponse,
    next: () => void,
  ): void => {
    const startedAt = performance.now();

    response.on('finish', () => {
      const event = {
        event: 'http_access',
        requestId: typeof request.requestId === 'string' && SAFE_REQUEST_ID.test(request.requestId)
          ? request.requestId
          : 'unknown',
        method: typeof request.method === 'string' && SAFE_METHOD.test(request.method)
          ? request.method
          : 'OTHER',
        route: routeTemplate(request),
        status: Number.isInteger(response.statusCode) && response.statusCode! >= 100 && response.statusCode! <= 599
          ? response.statusCode
          : 0,
        elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };

      try {
        writeLog(JSON.stringify(event));
      } catch {
        // Observability must not turn a completed request into an application error.
      }
    });

    next();
  };
}

export const accessLogMiddleware = createAccessLogMiddleware();
