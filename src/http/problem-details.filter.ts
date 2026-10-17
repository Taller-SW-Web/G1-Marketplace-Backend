/**
 * Filtro de excepciones — sobre `application/problem+json` del contrato
 * API F-011 v1 §4 (RFC 9457).
 *
 * Se aplica al módulo de catálogo (controlador F-011) vía `@UseFilters`;
 * los demás módulos conservan su sobre `{ error: { code, message } }` hasta
 * que cada responsable lo homologue.
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { buildProblemDetails } from './problem-details';
import { REQUEST_ID_HEADER } from './request-id.middleware';

/** Código de respaldo cuando una excepción no trae `code` propio. */
const FALLBACK_CODE = 'CATALOG_ERROR';

interface ProblemRequest {
  originalUrl?: string;
  url?: string;
  requestId?: string;
}

interface ProblemResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/** Extrae `code` de `{ error: { code } }` o de un `code` raíz. */
function extractCode(exception: HttpException): string {
  const record = asRecord(exception.getResponse());
  if (typeof record?.code === 'string') return record.code;
  const nested = asRecord(record?.error);
  if (typeof nested?.code === 'string') return nested.code;
  return FALLBACK_CODE;
}

/** Extrae el mensaje propio de Marketplace como `detail` del problema. */
function extractDetail(exception: HttpException): string | undefined {
  const record = asRecord(exception.getResponse());
  const nested = asRecord(record?.error);
  const detail = nested?.message ?? record?.message;
  return typeof detail === 'string' && detail.length > 0 ? detail : undefined;
}

@Catch(HttpException)
export class ProblemDetailsFilter implements ExceptionFilter<HttpException> {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: HttpException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<ProblemResponse>();
    const request = http.getRequest<ProblemRequest>();
    const status = exception.getStatus();
    const code = extractCode(exception);
    const problem = buildProblemDetails({
      status,
      code,
      detail: extractDetail(exception),
      instance: request.originalUrl ?? request.url ?? '/',
      requestId: request.requestId ?? randomUUID(),
    });

    response.statusCode = status;
    response.setHeader(
      'Content-Type',
      'application/problem+json; charset=utf-8',
    );
    response.setHeader(REQUEST_ID_HEADER, problem.requestId);
    response.end(JSON.stringify(problem));

    // Diagnóstico técnico sin PII: sólo código, estado y correlación.
    if (status >= 500) {
      this.logger.warn(
        JSON.stringify({
          event: 'catalog_error',
          code,
          status,
          requestId: problem.requestId,
        }),
      );
    }
  }
}
