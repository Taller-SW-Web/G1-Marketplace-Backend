import { Inject, Injectable } from '@nestjs/common';
import { parseQuery } from './query';
import { CatalogError } from './errors';
import { CATALOG_PROVIDER } from './types';
import type { CatalogProvider, CatalogSource, CatalogPageDTO, HomeDTO } from './types';

@Injectable()
export class CatalogService {
  constructor(@Inject(CATALOG_PROVIDER) private readonly provider: CatalogProvider) {}

  get source(): CatalogSource { return this.provider.source; }

  filters(params: URLSearchParams, requestId: string) {
    if (params.size) throw new CatalogError('INVALID_PARAMETERS', 400);
    if (!this.provider.filters) throw new CatalogError('CATALOG_UNAVAILABLE', 503);
    return this.provider.filters(requestId);
  }

  home(params: URLSearchParams, requestId: string): Promise<HomeDTO> {
    if (params.size) throw new CatalogError('INVALID_PARAMETERS', 400);
    return this.provider.home(requestId);
  }

  search(params: URLSearchParams, requestId: string): Promise<CatalogPageDTO> {
    return this.provider.search(parseQuery(params), requestId);
  }
}
