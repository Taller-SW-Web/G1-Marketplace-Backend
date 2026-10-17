import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, IdentityGuard } from '../identity/identity.guard';
import { ProductIdPipe, SaveWishlistItemDto } from './product-id';
import { WishlistService } from './wishlist.service';
import { WishlistReadService } from './wishlist-read.service';
import { WishlistCartService } from './wishlist-cart.service';
import { ApiError } from '../http/api-error';

@Controller('api/v1/wishlist')
@UseGuards(IdentityGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService, private readonly reader: WishlistReadService,
    private readonly cart: WishlistCartService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest & { query: Record<string, unknown> }) {
    if (Object.keys(request.query).length) throw new ApiError(400, 'INVALID_REQUEST', 'No se admiten parámetros');
    return this.reader.list(request.identity.customerId);
  }

  @Post('items/:productId/add-to-cart')
  @HttpCode(200)
  async addToCart(@Param('productId', ProductIdPipe) productId: string,
    @Req() request: AuthenticatedRequest & { headers: Record<string, string | undefined>; query: Record<string, unknown>; body?: unknown }) {
    if (Number(request.headers['content-length'] ?? 0) !== 0 || request.headers['transfer-encoding']
      || Object.keys(request.query).length || request.headers['idempotency-key']) {
      throw new ApiError(400, 'INVALID_REQUEST', 'Adición inválida; sin cuerpo ni clave idempotente');
    }
    return this.cart.add(request.identity.customerId, productId);
  }

  @Post('items')
  async save(@Body() dto: SaveWishlistItemDto, @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: { status(code: number): unknown }): Promise<{ productId: string }> {
    const result = await this.wishlist.save(request.identity.customerId, dto.productId);
    response.status(result.created ? 201 : 200);
    return { productId: result.productId };
  }

  @Delete('items/:productId')
  @HttpCode(204)
  async remove(@Param('productId', ProductIdPipe) productId: string,
    @Req() request: AuthenticatedRequest): Promise<void> {
    await this.wishlist.remove(request.identity.customerId, productId);
  }
}
