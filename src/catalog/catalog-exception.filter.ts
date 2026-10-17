import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { CatalogError, problem } from './errors';
import type { CatalogRequest } from './catalog.controller';

@Catch(CatalogError)
export class CatalogExceptionFilter implements ExceptionFilter<CatalogError> {
  catch(error: CatalogError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<ServerResponse>();
    const request = http.getRequest<CatalogRequest>();
    response.statusCode = error.status;
    response.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    response.end(JSON.stringify(problem(error, request.catalogRequestId)));
  }
}
