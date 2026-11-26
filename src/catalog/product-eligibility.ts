import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../http/api-error';
import { SANDBOX_ACTIVE_PRODUCTS } from './wishlist-catalog';

export abstract class ProductEligibilityPort {
  abstract isActive(productId: string): Promise<boolean>;
}

@Injectable()
export class SandboxProductEligibility extends ProductEligibilityPort {
  constructor(private readonly config: ConfigService) { super(); }

  async isActive(productId: string): Promise<boolean> {
    if (!this.config.get<boolean>('H3_SANDBOX_ENABLED', false)
      || !['development', 'test'].includes(this.config.get<string>('NODE_ENV', process.env.NODE_ENV ?? 'development'))
      || productId === 'PRD-UNAVAILABLE') {
      throw new ApiError(503, 'CATALOG_UNAVAILABLE', 'Catálogo no disponible');
    }
    return SANDBOX_ACTIVE_PRODUCTS.includes(productId);
  }
}
