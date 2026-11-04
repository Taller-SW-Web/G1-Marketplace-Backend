import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseOrdersQuery } from './dto/orders-query.dto';
import { OrdersService } from './orders.service';
import { OptionalAuthGuard } from '../security/optional-auth.guard';
import { AuthenticatedRequest } from '../security/auth.types';
import { AuthGuard } from '../security/auth.guard';
import { ReorderService } from './reorder.service';

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

@Controller('api/v1/orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
    private readonly reorders: ReorderService,
  ) {}

  @Get('me')
  @UseGuards(OptionalAuthGuard)
  async listMyOrders(
    @Query() rawQuery: Record<string, unknown>,
    @Res({ passthrough: true }) response: ResponseHeaders,
    @Req() request: AuthenticatedRequest = { headers: {} },
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const query = parseOrdersQuery(rawQuery);
    const isMock =
      this.config.get<string>('ORDERS_SOURCE') === 'mock' &&
      this.config.get<string>('NODE_ENV') !== 'production';
    const source = isMock ? 'MOCK' : this.config.get<string>('ORDERS_SOURCE') === 'g5' ? 'REAL' : 'UNCONFIGURED';
    response.setHeader('X-Orders-Source', source);
    const token = this.accessToken(request);
    return token ? this.orders.listMyOrders(query, token) : this.orders.listMyOrders(query);
  }

  @Get(':orderId')
  @UseGuards(OptionalAuthGuard)
  async getMyOrder(@Param('orderId') orderId: string, @Req() request: AuthenticatedRequest = { headers: {} }) {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(orderId)) {
      throw new BadRequestException({ error: { code: 'INVALID_ORDER_ID' } });
    }
    const token = this.accessToken(request);
    return token ? this.orders.getMyOrder(orderId, token) : this.orders.getMyOrder(orderId);
  }

  @Get(':orderId/tracking')
  @UseGuards(OptionalAuthGuard)
  async getMyOrderTracking(
    @Param('orderId') orderId: string,
    @Res({ passthrough: true }) response: ResponseHeaders & { status(code: number): void },
    @Req() request: AuthenticatedRequest = { headers: {} },
  ) {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(orderId)) {
      throw new BadRequestException({ error: { code: 'INVALID_ORDER_ID' } });
    }
    const token = this.accessToken(request);
    const result = token
      ? await this.orders.getMyOrderTracking(orderId, token)
      : await this.orders.getMyOrderTracking(orderId);
    response.status(result.status);
    return result.body;
  }

  @Post(':orderId/reorder')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async reorder(
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest = { headers: {} },
  ) {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(orderId)) {
      throw new BadRequestException({ error: { code: 'INVALID_ORDER_ID' } });
    }
    if (body !== undefined && (typeof body !== 'object' || body === null || Array.isArray(body)
      || Object.keys(body).length > 0)) {
      throw new BadRequestException({ error: { code: 'EMPTY_BODY_REQUIRED' } });
    }
    const rawKey = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (typeof idempotencyKey !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      throw new BadRequestException({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    }
    return this.reorders.reorder(request.user?.sub, orderId, idempotencyKey, this.accessToken(request));
  }

  private accessToken(request: AuthenticatedRequest): string | undefined {
    const value = request.headers.authorization;
    const header = Array.isArray(value) ? value[0] : value;
    return typeof header === 'string' ? /^Bearer\s+([^\s]+)$/i.exec(header)?.[1] : undefined;
  }
}
