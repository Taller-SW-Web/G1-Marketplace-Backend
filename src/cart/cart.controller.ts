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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extraer y validar customerId desde el encabezado Authorization (JWT o Bearer mock)
 * Garantiza alineación con Checkout sin confiar en x-customer-id arbitrarios
 */
export function extractCustomerIdFromAuth(
  authHeader?: string | string[],
): string | undefined {
  if (!authHeader || typeof authHeader !== 'string') return undefined;
  if (!authHeader.startsWith('Bearer ')) return undefined;

  const token = authHeader.slice(7).trim();
  if (!token) return undefined;

  // 1. Si el token es directamente un UUID (ej. usuario mock 11111111-1111-4111-8111-111111111111)
  if (UUID_REGEX.test(token)) {
    return token;
  }

  // 2. Si el token contiene un UUID (ej. mock-token-11111111-1111-4111-8111-111111111111)
  const match = token.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (match && UUID_REGEX.test(match[0])) {
    return match[0];
  }

  // 3. Si el token es un JWT estructurado (header.payload.signature)
  const parts = token.split('.');
  if (parts.length >= 2) {
    try {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      const sub = payload.sub || payload.customerId;
      if (typeof sub === 'string' && UUID_REGEX.test(sub)) {
        return sub;
      }
    } catch {
      // Ignorar JWTs malformados
    }
  }

  return undefined;
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
  ): { sessionHash?: string; customerId?: string } {
    // 1. Extraer customerId únicamente desde el token autenticado (sub del JWT)
    const customerId = extractCustomerIdFromAuth(req.headers['authorization']);

    // 2. Manejo de sesión anónima si no hay autenticación
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
