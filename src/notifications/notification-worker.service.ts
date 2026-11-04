import { Inject, Injectable, Optional } from '@nestjs/common';
import { NotificationDeliveryState, NotificationDeliveryType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { buildOrderDetailUrl, renderOrderConfirmation, renderShipmentUpdate } from './email-template';
import { RecipientEmailCipher } from './recipient-email-cipher';

export const NOTIFICATION_EMAIL_PROVIDER = Symbol('NOTIFICATION_EMAIL_PROVIDER');

export type ReconciliationResult =
  | { status: 'SENT'; messageId: string }
  | { status: 'NOT_SENT' }
  | { status: 'UNKNOWN' };

export interface NotificationEmailProvider {
  /** Must treat eventKey as an idempotency key, including after a client timeout. */
  send(input: { recipient: string; eventKey: string; subject: string; text: string; html: string }): Promise<
    | { status: 'SENT'; messageId: string }
    | { status: 'RETRYABLE_FAILURE'; code: string }
    | { status: 'OUTCOME_UNKNOWN'; code: string }
  >;
  /** NOT_SENT must be authoritative; UNKNOWN is moved to manual reconciliation. */
  reconcile(eventKey: string): Promise<ReconciliationResult>;
}

const MAX_ATTEMPTS = 5;
const LEASE_MS = 30_000;

/**
 * Single-batch worker logic. It is deliberately not scheduled or wired to a provider here.
 * Runtime processing stays disabled until G-MAIL approves an idempotency/reconciliation contract.
 */
@Injectable()
export class NotificationWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(NOTIFICATION_EMAIL_PROVIDER) private readonly provider?: NotificationEmailProvider,
  ) {}

  async processPendingBatch(limit = 10): Promise<number> {
    if (process.env.NOTIFICATION_WORKER_ENABLED !== 'true' || !this.provider || !Number.isInteger(limit)
      || limit < 1 || limit > 100) return 0;
    const keyHex = process.env.NOTIFICATION_EMAIL_ENCRYPTION_KEY ?? '';
    if (!/^[0-9a-f]{64}$/i.test(keyHex)) return 0;
    const cipher = new RecipientEmailCipher(Buffer.from(keyHex, 'hex'));
    let handled = 0;
    for (let index = 0; index < limit; index += 1) {
      const claimed = await this.claimOne();
      if (!claimed) break;
      handled += 1;
      await this.deliverClaim(claimed, cipher);
    }
    return handled;
  }

  private async claimOne() {
    const now = new Date();
    const candidate = await this.prisma.notificationDelivery.findFirst({
      where: {
        OR: [
          { state: NotificationDeliveryState.PENDING, nextAttemptAt: { lte: now } },
          { state: NotificationDeliveryState.PROCESSING, leaseExpiresAt: { lte: now } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!candidate) return undefined;
    const leaseToken = randomUUID();
    const acquired = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: candidate.id,
        state: candidate.state,
        OR: [
          { leaseToken: null },
          { leaseExpiresAt: { lte: now } },
        ],
        ...(candidate.state === NotificationDeliveryState.PENDING ? { nextAttemptAt: { lte: now } } : {}),
      },
      data: {
        state: NotificationDeliveryState.PROCESSING,
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
      },
    });
    if (!acquired.count) return undefined;
    const delivery = await this.prisma.notificationDelivery.findFirst({ where: { id: candidate.id, leaseToken } });
    return delivery ? { ...delivery, leaseToken } : undefined;
  }

  private async deliverClaim(
    delivery: NonNullable<Awaited<ReturnType<NotificationWorkerService['claimOne']>>>,
    cipher: RecipientEmailCipher,
  ): Promise<void> {
    if (!this.provider) return;
    if (!delivery.payloadSnapshot || ![
      NotificationDeliveryType.ORDER_CONFIRMATION,
      NotificationDeliveryType.SHIPMENT_UPDATE,
    ].includes(delivery.type)) {
      await this.finish(delivery, {
        state: NotificationDeliveryState.FAILED,
        lastErrorCode: 'PAYLOAD_UNAVAILABLE',
      });
      return;
    }
    let rendered: ReturnType<typeof renderOrderConfirmation> | ReturnType<typeof renderShipmentUpdate>;
    let recipient: string;
    try {
      const origin = process.env.G1_WEB_ORIGIN;
      if (!origin) throw new TypeError('Marketplace origin is not configured.');
      const snapshot = delivery.payloadSnapshot as unknown as Record<string, unknown>;
      if (delivery.type === NotificationDeliveryType.ORDER_CONFIRMATION) {
        if (delivery.payloadVersion !== 'C-001-v1') throw new TypeError('Unsupported template version.');
        const order = snapshot as unknown as {
          orderId: string; orderState: 'PAGADO'; createdAt: string; total: { amount: number; currency: string };
        };
        rendered = renderOrderConfirmation({
          ...order,
          orderDetailUrl: buildOrderDetailUrl(origin, order.orderId),
        });
      } else {
        if (delivery.payloadVersion !== 'C-002-v1') throw new TypeError('Unsupported template version.');
        const shipment = snapshot as unknown as {
          shipmentEventId: string; orderId: string; publicStatus: 'DESPACHADO' | 'ENTREGADO';
          occurredAt: string; estimatedDelivery?: string;
        };
        const trackingUrl = new URL(buildOrderDetailUrl(origin, shipment.orderId));
        trackingUrl.pathname += '/seguimiento';
        rendered = renderShipmentUpdate({
          ...shipment,
          trackingUrl: trackingUrl.toString(),
        });
      }
      recipient = cipher.decrypt(delivery.recipientEmailEncrypted);
    } catch {
      await this.finish(delivery, {
        state: NotificationDeliveryState.FAILED,
        lastErrorCode: 'PAYLOAD_OR_RECIPIENT_INVALID',
      });
      return;
    }

    let result: Awaited<ReturnType<NotificationEmailProvider['send']>>;
    try {
      result = await this.provider.send({
        recipient,
        eventKey: delivery.eventKey,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
    } catch {
      result = { status: 'OUTCOME_UNKNOWN', code: 'PROVIDER_RESPONSE_LOST' };
    }
    if (result.status === 'SENT') {
      await this.finish(delivery, { state: NotificationDeliveryState.SENT, providerMessageId: result.messageId });
      return;
    }
    if (result.status === 'OUTCOME_UNKNOWN') {
      let reconciliation: ReconciliationResult = { status: 'UNKNOWN' };
      try { reconciliation = await this.provider.reconcile(delivery.eventKey); } catch { /* keep unknown */ }
      if (reconciliation.status === 'SENT') {
        await this.finish(delivery, {
          state: NotificationDeliveryState.SENT,
          providerMessageId: reconciliation.messageId,
        });
        return;
      }
      if (reconciliation.status === 'UNKNOWN') {
        await this.finish(delivery, {
          state: NotificationDeliveryState.RECONCILIATION_REQUIRED,
          lastErrorCode: 'DELIVERY_OUTCOME_UNRESOLVED',
        });
        return;
      }
      await this.retryOrFail(delivery, result.code);
      return;
    }
    await this.retryOrFail(delivery, result.code);
  }

  private async retryOrFail(delivery: { id: string; leaseToken: string; attemptCount: number }, code: string) {
    if (delivery.attemptCount >= MAX_ATTEMPTS) {
      await this.finish(delivery, { state: NotificationDeliveryState.FAILED, lastErrorCode: safeCode(code) });
      return;
    }
    const delay = Math.min(60 * 60_000, 1_000 * 2 ** Math.max(0, delivery.attemptCount - 1));
    await this.finish(delivery, {
      state: NotificationDeliveryState.PENDING,
      nextAttemptAt: new Date(Date.now() + delay),
      lastErrorCode: safeCode(code),
    });
  }

  private async finish(
    delivery: { id: string; leaseToken: string },
    data: Prisma.NotificationDeliveryUpdateManyMutationInput,
  ) {
    await this.prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, state: NotificationDeliveryState.PROCESSING, leaseToken: delivery.leaseToken },
      data: {
        ...data,
        ...(data.state === NotificationDeliveryState.SENT ? { sentAt: new Date() } : {}),
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
  }
}

function safeCode(value: string): string {
  return /^[A-Z0-9_]{1,100}$/.test(value) ? value : 'PROVIDER_FAILURE';
}
