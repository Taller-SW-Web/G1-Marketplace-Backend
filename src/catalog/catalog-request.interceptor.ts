import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { CatalogError } from './errors';
import { CatalogService } from './catalog.service';
import type { CatalogRequest } from './catalog.controller';

@Injectable()
export class CatalogRequestInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CatalogRequestInterceptor.name);
  constructor(private readonly catalog: CatalogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<CatalogRequest>();
    const response = http.getResponse<ServerResponse>();
    const requestId = request.requestId ?? randomUUID();
    const startedAt = Date.now();
    request.catalogRequestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('X-Catalog-Source', this.catalog.source);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const url = new URL(request.url || '/', 'http://marketplace.local');
    const q = (url.searchParams.get('q') || '').trim().replace(/\s+/gu, ' ');
    return next.handle().pipe(
      tap(() => this.logger.log(JSON.stringify({
        event: 'catalog_read', requestId, path: url.pathname, source: this.catalog.source, status: 200,
        queryHash: q ? createHash('sha256').update(q).digest('hex') : undefined,
        durationMs: Date.now() - startedAt,
      }))),
      catchError((error: unknown) => {
        const safe = error instanceof CatalogError ? error : new CatalogError();
        this.logger.warn(JSON.stringify({
          event: 'catalog_error', requestId, code: safe.code, diagnostic: safe.diagnostic,
          status: safe.status, durationMs: Date.now() - startedAt,
        }));
        return throwError(() => safe);
      }),
    );
  }
}
