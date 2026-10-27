import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../security/auth.guard';
import { AuthenticatedRequest } from '../security/auth.types';
import { CheckoutService } from './checkout.service';
import { CreateOrderRequestDto } from './dto/contact.dto';
import { CreateDeliveryAddressDto } from './dto/delivery-address.dto';
import { ApplyBenefitDto, CreateQuoteDto, PrepareCheckoutDto } from './dto/quote.dto';

interface StatusResponse {
  status(code: number): unknown;
}

@Controller('api/v1/checkout')
@UseGuards(AuthGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('delivery-addresses')
  async listAddresses(@Req() request: AuthenticatedRequest) {
    const addresses = await this.checkout.listAddresses(
      this.accessToken(request),
    );
    return { data: addresses };
  }

  @Post('delivery-addresses')
  async createAddress(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateDeliveryAddressDto,
  ) {
    const address = await this.checkout.createAddress(
      this.customerId(request),
      this.accessToken(request),
      input,
    );
    return { data: address };
  }

  @Post('quotes')
  @HttpCode(HttpStatus.OK)
  async createQuote(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateQuoteDto,
  ) {
    const sessionHash = this.cartSession(request);
    const quote = await this.checkout.createQuote(
      this.customerId(request),
      this.accessToken(request),
      input,
      sessionHash,
    );
    return { data: quote };
  }

  @Post('benefits')
  @HttpCode(HttpStatus.OK)
  async applyBenefit(
    @Req() request: AuthenticatedRequest,
    @Body() input: ApplyBenefitDto,
  ) {
    const quote = await this.checkout.applyBenefit(this.customerId(request), input);
    return { data: quote };
  }

  @Post('preparations')
  async prepare(
    @Req() request: AuthenticatedRequest,
    @Body() input: PrepareCheckoutDto,
  ) {
    const operation = await this.checkout.prepare(
      this.customerId(request),
      input,
      this.header(request, 'idempotency-key'),
      this.cartSession(request),
    );
    return { data: operation };
  }

  @Post('orders')
  async createOrder(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateOrderRequestDto,
    @Res({ passthrough: true }) response: StatusResponse,
  ) {
    const result = await this.checkout.createOrder(
      this.customerId(request),
      input,
      this.header(request, 'idempotency-key'),
      this.cartSession(request),
    );
    response.status(result.status);
    return { data: result.data };
  }

  @Get('operations/:operationId')
  async getOperation(
    @Req() request: AuthenticatedRequest,
    @Param(
      'operationId',
      new ParseUUIDPipe({
        exceptionFactory: () => new BadRequestException({
          error: { code: 'INVALID_OPERATION_ID' },
        }),
      }),
    ) operationId: string,
    @Res({ passthrough: true }) response: StatusResponse,
  ) {
    const result = await this.checkout.getOperation(
      this.customerId(request),
      operationId,
      this.cartSession(request),
    );
    response.status(result.status);
    return { data: result.data };
  }

  private customerId(request: AuthenticatedRequest): string {
    if (!request.user?.sub) throw new Error('Authenticated principal missing');
    return request.user.sub;
  }

  private accessToken(request: AuthenticatedRequest): string {
    const value = this.header(request, 'authorization');
    const token = value && /^Bearer\s+([^\s]+)$/i.exec(value)?.[1];
    if (!token) throw new Error('Authenticated bearer token missing');
    return token;
  }

  private header(request: AuthenticatedRequest, name: string): string | undefined {
    const headers = request.headers;
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }

  private cartSession(request: AuthenticatedRequest): string | undefined {
    const cookie = this.header(request, 'cookie');
    const session = cookie && /(?:^|;\s*)cart_session=([A-Za-z0-9_-]{16,128})(?:;|$)/.exec(cookie);
    return session?.[1];
  }
}
