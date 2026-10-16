import { Body, Controller, Delete, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, IdentityGuard } from '../identity/identity.guard';
import { ProductIdPipe, SaveWishlistItemDto } from './product-id';
import { WishlistService } from './wishlist.service';

@Controller('api/v1/wishlist/items')
@UseGuards(IdentityGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Post()
  async save(@Body() dto: SaveWishlistItemDto, @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: { status(code: number): unknown }): Promise<{ productId: string }> {
    const result = await this.wishlist.save(request.identity.customerId, dto.productId);
    response.status(result.created ? 201 : 200);
    return { productId: result.productId };
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(@Param('productId', ProductIdPipe) productId: string,
    @Req() request: AuthenticatedRequest): Promise<void> {
    await this.wishlist.remove(request.identity.customerId, productId);
  }
}
