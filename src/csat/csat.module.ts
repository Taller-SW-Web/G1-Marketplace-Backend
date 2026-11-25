import { Body, Controller, HttpCode, Module, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiError } from '../http/api-error';
import { AuthenticatedRequest, IdentityGuard, IdentityPort, SandboxIdentityAdapter } from '../identity/identity.guard';
import { CartModule } from '../cart/cart.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SubmitCsatDto } from './csat.dto';
import { CsatGateway, SalesCsatGateway } from './csat.gateway';
import { CsatService } from './csat.service';

@Controller('api/v1/orders')
@UseGuards(IdentityGuard)
export class CsatController {
  constructor(private readonly csat: CsatService) {}

  @Post(':orderId/csat')
  @HttpCode(201)
  async submit(@Param('orderId') orderId: string, @Body() dto: SubmitCsatDto,
    @Req() request: AuthenticatedRequest & { query: Record<string, unknown> }): Promise<void> {
    if (!/^PED-[0-9]{4}-[0-9]{5,}$/.test(orderId) || orderId.length > 100 || Object.keys(request.query).length) {
      throw new ApiError(400, 'INVALID_REQUEST', 'Solicitud de evaluación inválida');
    }
    await this.csat.submit(request.identity.customerId, orderId, request.headers.authorization!.split(' ')[1], dto);
  }
}

@Module({ imports: [PrismaModule, CartModule], controllers: [CsatController],
  providers: [CsatService, IdentityGuard, { provide: IdentityPort, useClass: SandboxIdentityAdapter },
    { provide: CsatGateway, useClass: SalesCsatGateway }] })
export class CsatModule {}
