import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../http/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitCsatDto } from './csat.dto';
import { CsatGateway } from './csat.gateway';

@Injectable()
export class CsatService {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService,
    private readonly sales: CsatGateway) {}

  async submit(customerId: string, orderId: string, token: string, dto: SubmitCsatDto): Promise<void> {
    if (this.config.get('CSAT_ENABLED') !== 'true' || this.config.get('CSAT_INTEGRATION_APPROVED') !== 'true'
      || this.config.get('CSAT_PROMPT_APPROVED') !== 'true') {
      throw new ApiError(503, 'CSAT_UNAVAILABLE', 'Evaluación no disponible');
    }
    const prompt = await this.prisma.postDeliveryPrompt.findUnique({
      where: { customerId_externalOrderId: { customerId, externalOrderId: orderId } },
      select: { state: true, deliveryConfirmedAt: true, shownAt: true },
    });
    if (!prompt) throw new ApiError(409, 'PROMPT_NOT_ELIGIBLE', 'Evaluación no habilitada');
    if (prompt.state === 'SUBMITTED') throw new ApiError(409, 'CSAT_ALREADY_SUBMITTED', 'La evaluación ya fue registrada');
    if (prompt.state !== 'SHOWN' || !prompt.shownAt || !Number.isFinite(prompt.shownAt.getTime())
      || prompt.shownAt.getTime() > Date.now() || !Number.isFinite(prompt.deliveryConfirmedAt.getTime())
      || prompt.deliveryConfirmedAt.getTime() > Date.now()) throw new ApiError(409, 'PROMPT_NOT_ELIGIBLE', 'Evaluación no habilitada');
    await this.sales.assertDelivered(orderId, customerId, token);
    const payload = { pedidoId: orderId, clienteId: customerId, canal: 'MARKETPLACE' as const,
      puntuacion: { GOOD: 5, REGULAR: 3, BAD: 1 }[dto.sentiment],
      comentario: [dto.reasons?.length ? `Motivos: [${dto.reasons.join(', ')}]` : '', dto.comment?.trim() ?? ''].filter(Boolean).join(' - ') };
    let duplicate: ApiError | undefined;
    try { await this.sales.submit(payload, token); }
    catch (error) {
      if (!(error instanceof ApiError) || error.getStatus() !== 409
        || (error.getResponse() as { code?: string }).code !== 'CSAT_ALREADY_SUBMITTED') throw error;
      duplicate = error;
    }
    // Only provider confirmation (201 or the canonical duplicate) advances local UX state.
    // A lost response leaves the prompt unchanged; a manual retry is reconciled by G5 uniqueness.
    await this.prisma.postDeliveryPrompt.updateMany({
      where: { customerId, externalOrderId: orderId, state: { not: 'SUBMITTED' } },
      data: { state: 'SUBMITTED', submittedAt: new Date(), dismissedAt: null },
    });
    if (duplicate) throw duplicate;
  }
}
