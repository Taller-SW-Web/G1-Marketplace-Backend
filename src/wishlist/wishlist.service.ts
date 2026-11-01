import { Injectable } from '@nestjs/common';
import { ProductEligibilityPort } from '../catalog/product-eligibility';
import { ApiError } from '../http/api-error';
import { WishlistRepository } from './wishlist.repository';

@Injectable()
export class WishlistService {
  constructor(private readonly repository: WishlistRepository, private readonly eligibility: ProductEligibilityPort) {}

  async save(customerId: string, productId: string): Promise<{ created: boolean; productId: string }> {
    if (!await this.eligibility.isActive(productId)) {
      throw new ApiError(404, 'PRODUCT_NOT_AVAILABLE', 'Producto no disponible');
    }
    return { ...await this.repository.save(customerId, productId), productId };
  }

  async remove(customerId: string, productId: string): Promise<void> {
    await this.repository.remove(customerId, productId);
  }
}
