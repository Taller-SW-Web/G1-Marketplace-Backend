import {
  Controller,
  HttpException,
  UnauthorizedException,
  Get,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseOrdersQuery } from './dto/orders-query.dto';
import { OrdersService } from './orders.service';
import { AuthGuard } from '../security/auth.guard';
import { AuthenticatedRequest } from '../security/auth.types';

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

@Controller('api/v1/orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  async listMyOrders(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const source = this.config.get<string>('ORDERS_SOURCE');
    const isMock =
      source === 'mock' &&
      this.config.get<string>('NODE_ENV') !== 'production';
    response.setHeader('X-Orders-Source', isMock ? 'MOCK' : source === 'real' ? 'REAL' : 'UNCONFIGURED');
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = typeof value === 'string' ? /^Bearer\s+([^\s]+)$/i.exec(value)?.[1] : undefined;
    if (!request.user?.sub || !token) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
    try {
      return await this.orders.listMyOrders(request.user.sub, parseOrdersQuery(query), token);
    } catch (error) {
      this.setRetryAfter(response, error);
      throw error;
    }
  }

  @Get(':orderId')
  async getOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = typeof value === 'string' ? /^Bearer\s+([^\s]+)$/i.exec(value)?.[1] : undefined;
    if (!request.user?.sub || !token) throw new UnauthorizedException({ error: { code: 'UNAUTHENTICATED' } });
    try {
      return await this.orders.getOrderForCustomer(request.user.sub, orderId, token);
    } catch (error) {
      this.setRetryAfter(response, error);
      throw error;
    }
  }

  private setRetryAfter(response: ResponseHeaders, error: unknown): void {
    if (!(error instanceof HttpException)) return;
    const body = error.getResponse();
    if (typeof body !== 'object' || body === null || !('error' in body) ||
        typeof body.error !== 'object' || body.error === null || !('retryAfterSeconds' in body.error)) return;
    const seconds = body.error.retryAfterSeconds;
    if (typeof seconds === 'number' && Number.isInteger(seconds) && seconds >= 0 && seconds <= 86400) {
      response.setHeader('Retry-After', String(seconds));
    }
  }
}
