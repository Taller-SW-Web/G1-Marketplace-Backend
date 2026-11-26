import {
  BadRequestException,
  UnauthorizedException,
  Body,
  Controller,
  Delete,
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

  @Delete(['current/items/:sku', 'items/:sku'])
  async removeItem(
    @Param('sku') sku: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const { sessionHash, customerId } = this.resolveSession(req, res);
    const expectedVersion = ifMatch ? parseInt(ifMatch, 10) : undefined;
    const result = await this.cartService.removeItemFromCart({
      sessionHash,
      customerId,
      sku,
      expectedVersion: Number.isInteger(expectedVersion) ? expectedVersion : undefined,
    });

    res.setHeader('X-Cart-Version', String(result.version));
    res.status(204);
    return;
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

  @Post(['current/merge-anonymous', 'merge-anonymous'])
  async mergeAnonymous(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    if (!req.user?.sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Inicia sesión para fusionar el carrito.',
      });
    }

    const sessionHash = parseSessionCookie(req.headers['cookie']);
    const result = await this.cartService.mergeAnonymousCart({
      customerId: req.user.sub,
      sessionHash: sessionHash || undefined,
    });

    if (result.cartId) {
      res.setHeader('X-Cart-Version', String(result.version));
    }

    if (result.merged) {
      // Invalida la cookie anónima tras commit exitoso (RN-F020-01)
      res.setHeader(
        'Set-Cookie',
        'cart_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      );
    }

    return {
      status: 'OK',
      data: result,
    };
  }


  @Post(['current/items/:sku/move-to-wishlist', 'items/:sku/move-to-wishlist'])
  async moveItemToWishlist(
    @Param('sku') sku: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    if (!req.user?.sub) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Inicia sesión para mover productos a favoritos.',
      });
    }

    const expectedVersion = ifMatch ? parseInt(ifMatch.replace(/["']/g, ''), 10) : undefined;
    const result = await this.cartService.moveItemToWishlist({
      customerId: req.user.sub,
      sku,
      expectedVersion: Number.isInteger(expectedVersion) ? expectedVersion : undefined,
    });

    res.setHeader('X-Cart-Version', String(result.version));
    return {
      status: 'OK',
      data: result,
    };
  }
}
