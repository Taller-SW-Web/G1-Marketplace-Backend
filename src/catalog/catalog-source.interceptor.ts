/**
 * Cabecera `X-Catalog-Source` (MOCK | REAL) de los endpoints BFF de catálogo.
 *
 * La consume el proxy server-only del frontend para distinguir datos de
 * demostración de la integración real. Se fija antes de ejecutar el handler,
 * por lo que también está presente en las respuestas de error.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { isRealCatalogSource } from './catalog-mode';

export function catalogSource(): 'MOCK' | 'REAL' {
  return isRealCatalogSource() ? 'REAL' : 'MOCK';
}

@Injectable()
export class CatalogSourceInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>();
    response.setHeader('X-Catalog-Source', catalogSource());
    return next.handle();
  }
}
