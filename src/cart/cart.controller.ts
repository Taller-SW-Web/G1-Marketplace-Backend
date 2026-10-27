import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemQuantityDto } from './dto/update-cart-item-quantity.dto';
import { OptionalAuthGuard } from '../security/optional-auth.guard';
import { AuthenticatedRequest } from '../security/auth.types';
import * as crypto from 'crypto';
import { mockSkuForProductId } from './mock-product-sku';

interface ResponseLike {
  setHeader(name: string, value: string): void;
  status(code: number): unknown;
}

function parseSessionCookie(cookieHeader?: string | string[]): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const match = cookieHeader.match(/cart_session=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

@Controller(['api/v1/carts', 'api/cart'])
@UseGuards(OptionalAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private resolveSession(
    req: AuthenticatedRequest,
    res: ResponseLike,
  ): { sessionHash?: string; customerId?: string } {
    // 1. Obtener customerId directamente desde el principal autenticado (validado criptográficamente por AuthGuard)
    const customerId = req.user?.sub;

    // 2. Manejo de sesión anónima si no hay usuario autenticado
    let sessionHash = parseSessionCookie(req.headers['cookie']);

    if (!customerId && !sessionHash) {
      sessionHash = crypto.randomUUID();
      res.setHeader(
        'Set-Cookie',
        `cart_session=${sessionHash}; Path=/; HttpOnly; SameSite=Lax`,
      );
    }

    return { sessionHash: sessionHash || undefined, customerId };
  }

  @Post(['current/items', 'items'])
  async addItem(
    @Body() body: AddCartItemDto,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const { sessionHash, customerId } = this.resolveSession(req, res);
    const sku = body.sku?.trim() || (body.productId ? mockSkuForProductId(body.productId) : '');
    if (!sku) {
      throw new BadRequestException({
        error: { code: 'PRODUCT_OR_SKU_REQUIRED' },
      });
    }
    const result = await this.cartService.addItemToCart({
      sessionHash,
      customerId,
      sku,
      quantity: body.quantity,
    });

    res.status(result.status);
    return {
      status: result.code,
      data: result.data,
    };
  }

  @Patch(['current/items/:sku', 'items/:sku'])
  async updateItemQuantity(
    @Param('sku') sku: string,
    @Body() body: UpdateCartItemQuantityDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const { sessionHash, customerId } = this.resolveSession(req, res);
    const expectedVersion = ifMatch ? parseInt(ifMatch, 10) : undefined;
    const snapshot = await this.cartService.updateItemQuantity({
      sessionHash,
      customerId,
      sku,
      quantity: body.quantity,
      expectedVersion: Number.isInteger(expectedVersion) ? expectedVersion : undefined,
    });

    return {
      status: 'OK',
      data: snapshot,
    };
  }

  @Get(['current', ''])
  async getCart(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const { sessionHash, customerId } = this.resolveSession(req, res);
    const snapshot = await this.cartService.getCurrentCart({
      sessionHash,
      customerId,
    });

    return {
      status: 'OK',
      data: snapshot,
    };
  }
}
