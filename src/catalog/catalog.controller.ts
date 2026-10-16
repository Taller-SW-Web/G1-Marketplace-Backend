import { All, Controller, Get, Req, Res, UseFilters, UseInterceptors } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { CatalogError } from './errors';
import { CatalogService } from './catalog.service';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import { CatalogRequestInterceptor } from './catalog-request.interceptor';

export type CatalogRequest = IncomingMessage & { catalogRequestId: string };

@Controller('api/v1/catalog')
@UseInterceptors(CatalogRequestInterceptor)
@UseFilters(CatalogExceptionFilter)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('home')
  home(@Req() request: CatalogRequest) {
    return this.catalog.home(new URL(request.url || '/', 'http://marketplace.local').searchParams, request.catalogRequestId);
  }

  @Get('products')
  search(@Req() request: CatalogRequest) {
    return this.catalog.search(new URL(request.url || '/', 'http://marketplace.local').searchParams, request.catalogRequestId);
  }

  @All(['home', 'products'])
  unsupportedMethod(@Res({ passthrough: true }) response: ServerResponse): never {
    response.setHeader('Allow', 'GET, OPTIONS');
    throw new CatalogError('METHOD_NOT_ALLOWED', 405);
  }
}
