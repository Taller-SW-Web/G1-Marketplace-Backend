import {
  Controller,
  UnauthorizedException,
  Get,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersQueryDto } from './dto/orders-query.dto';
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
    @Query() query: OrdersQueryDto,
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
    return this.orders.listMyOrders(request.user.sub, query, token);
  }
}
