import {
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { OrdersService } from './orders.service';

interface ResponseHeaders {
  setHeader(name: string, value: string): void;
}

@Controller('api/v1/orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  async listMyOrders(
    @Query() query: OrdersQueryDto,
    @Res({ passthrough: true }) response: ResponseHeaders,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    const isMock =
      this.config.get<string>('ORDERS_SOURCE') === 'mock' &&
      this.config.get<string>('NODE_ENV') !== 'production';
    response.setHeader('X-Orders-Source', isMock ? 'MOCK' : 'UNCONFIGURED');
    return this.orders.listMyOrders(query);
  }
}
