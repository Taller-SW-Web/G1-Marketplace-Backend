import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import * as crypto from 'crypto';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

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
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private resolveSession(
    req: RequestLike,
    res: ResponseLike,
  ): { sessionHash: string; customerId?: string } {
    const customerIdHeader = req.headers['x-customer-id'];
    const customerId =
      typeof customerIdHeader === 'string' ? customerIdHeader : undefined;
    let sessionHash = parseSessionCookie(req.headers['cookie']);

    if (!sessionHash) {
      sessionHash = crypto.randomUUID();
      res.setHeader(
        'Set-Cookie',
        `cart_session=${sessionHash}; Path=/; HttpOnly; SameSite=Lax`,
      );
    }

    return { sessionHash, customerId };
  }

  @Post(['current/items', 'items'])
  async addItem(
    @Body() body: AddCartItemDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ) {
    const { sessionHash, customerId } = this.resolveSession(req, res);
    const result = await this.cartService.addItemToCart({
      sessionHash,
      customerId,
      sku: body.sku,
      quantity: body.quantity,
    });

    res.status(result.status);
    return {
      status: result.code,
      data: result.data,
    };
  }

  @Get(['current', ''])
  async getCart(
    @Req() req: RequestLike,
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
