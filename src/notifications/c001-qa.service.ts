import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { CheckoutOperationState, NotificationDeliveryState, NotificationDeliveryType, Prisma } from '@prisma/client';
import { isEmail } from 'class-validator';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SalesOrder } from '../checkout/checkout.types';
import { PrismaService } from '../prisma/prisma.service';
import { deliverCommercialMail, type CommercialMailTransport } from './commercial-mail-delivery';
import { createConfiguredCommercialMailTransport } from './commercial-mail-transport';

const ORDER_CONFIRMATION = NotificationDeliveryType.ORDER_CONFIRMATION;
const ORDER_ID = /^PED-\d{4}-\d{5}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const POLL_MS = 5000;

interface C001QaSettings {
  operationId: string;
  to: string;
  key: Buffer;
  webOrigin: string;
}

type Operation = Prisma.CheckoutOperationGetPayload<object>;
type Queue = PrismaService['notificationDelivery'];

export function readC001QaSettings(env: NodeJS.ProcessEnv): C001QaSettings | null {
  if (env.C001_QA_ENABLED !== 'true' || env.BREVO_ENABLED !== 'true') return null;
  const operationId = env.C001_QA_CHECKOUT_OPERATION_ID?.trim();
  const to = env.C001_QA_TO?.trim();
  const key = Buffer.from(env.C001_QA_ENCRYPTION_KEY ?? '', 'base64');
  const origin = URL.parse(env.G1_WEB_ORIGIN ?? '');
  if (env.MAIL_PROVIDER !== 'brevo' || !operationId || !UUID.test(operationId) ||
      !to || !isEmail(to) || key.length !== 32 || key.toString('base64') !== env.C001_QA_ENCRYPTION_KEY ||
      !origin || origin.protocol !== 'https:' || origin.origin !== env.G1_WEB_ORIGIN) {
    throw new Error('C001_QA_CONFIG_INVALID');
  }
  return { operationId: operationId.toLowerCase(), to, key, webOrigin: origin.origin };
}

function recipientContext(orderId: string, customerId: string): Buffer {
  return Buffer.from(`c001:${orderId}:${customerId}`, 'utf8');
}

function sealRecipient(settings: C001QaSettings, orderId: string, customerId: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', settings.key, iv, { authTagLength: 16 });
  cipher.setAAD(recipientContext(orderId, customerId));
  const encrypted = Buffer.concat([cipher.update(settings.to, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function openRecipient(
  settings: C001QaSettings,
  row: { recipientEmailEncrypted: Uint8Array; externalOrderId: string; customerId: string },
): string | null {
  try {
    const sealed = Buffer.from(row.recipientEmailEncrypted);
    const decipher = createDecipheriv('aes-256-gcm', settings.key, sealed.subarray(0, 12), { authTagLength: 16 });
    decipher.setAAD(recipientContext(row.externalOrderId, row.customerId));
    decipher.setAuthTag(sealed.subarray(12, 28));
    const to = Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString('utf8');
    return to === settings.to ? to : null;
  } catch {
    return null;
  }
}

function unavailable() {
  return new ServiceUnavailableException({ error: { code: 'C001_QA_CONFIRMATION_UNAVAILABLE' } });
}

export async function completeC001QaOperation(
  prisma: Pick<PrismaService, '$transaction'>,
  settings: C001QaSettings,
  operation: Pick<Operation, 'id' | 'customerId' | 'externalOrderId'>,
  order: SalesOrder,
  completedAt: Date,
): Promise<Operation> {
  const totalCents = Math.round(order.total.amount * 100);
  if (operation.id !== settings.operationId || operation.externalOrderId !== order.pedidoId ||
      order.estado !== 'PAGADO' || !ORDER_ID.test(order.pedidoId) || order.total.currency !== 'PEN' ||
      !Number.isSafeInteger(totalCents) || totalCents < 0) throw unavailable();

  return prisma.$transaction(async tx => {
    const where = { id: operation.id, customerId: operation.customerId, externalOrderId: order.pedidoId };
    const transition = await tx.checkoutOperation.updateMany({
      where: { ...where, state: CheckoutOperationState.SUBMITTED },
      data: { state: CheckoutOperationState.SUCCEEDED, failureCode: null, completedAt },
    });
    const confirmed = await tx.checkoutOperation.findFirst({ where });
    if (confirmed?.state !== CheckoutOperationState.SUCCEEDED || !confirmed.completedAt) throw unavailable();

    if (transition.count === 1) {
      await tx.notificationDelivery.createMany({
        skipDuplicates: true,
        data: {
          type: ORDER_CONFIRMATION,
          eventKey: `c001:${order.pedidoId}`,
          externalOrderId: order.pedidoId,
          customerId: operation.customerId,
          recipientEmailEncrypted: sealRecipient(settings, order.pedidoId, operation.customerId),
          payloadVersion: 'v1',
          confirmationSnapshot: {
            checkoutOperationId: confirmed.id,
            completedAt: confirmed.completedAt.toISOString(),
            totalCents,
          },
        },
      });
    }
    return confirmed;
  });
}

export async function processC001QaDelivery(queue: Queue, settings: C001QaSettings, transport: CommercialMailTransport) {
  const pending = {
    type: ORDER_CONFIRMATION,
    state: NotificationDeliveryState.PENDING,
    attemptCount: 0,
    confirmationSnapshot: { path: ['checkoutOperationId'], equals: settings.operationId },
  };
  const row = await queue.findFirst({ where: pending, orderBy: { createdAt: 'asc' } });
  if (!row) return { status: 'idle' } as const;

  const snapshot = row.confirmationSnapshot;
  const to = openRecipient(settings, row);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
      typeof snapshot.completedAt !== 'string' || Number.isNaN(Date.parse(snapshot.completedAt)) ||
      typeof snapshot.totalCents !== 'number' || !Number.isSafeInteger(snapshot.totalCents) || snapshot.totalCents < 0 ||
      !to || !ORDER_ID.test(row.externalOrderId) || row.eventKey !== `c001:${row.externalOrderId}` ||
      row.payloadVersion !== 'v1') {
    return { status: 'invalid_snapshot', deliveryId: row.id } as const;
  }
  const lastAttemptAt = new Date(Math.max(Date.now(), row.createdAt.getTime() + 1));
  // The claim commits before the provider call. An uncertain attempt is never sent again automatically.
  const claim = await queue.updateMany({
    where: { id: row.id, ...pending },
    data: { attemptCount: 1, lastAttemptAt },
  });
  if (claim.count !== 1) return { status: 'contended' } as const;

  const webOrigin = settings.webOrigin;
  const orderUrl = new URL(`/mis-pedidos/${row.externalOrderId}`, webOrigin).href;
  const receipt = await deliverCommercialMail({
    type: ORDER_CONFIRMATION,
    orderId: row.externalOrderId,
    state: 'PAGADO',
    occurredAt: snapshot.completedAt,
    totalCents: snapshot.totalCents,
  }, to, { marketplaceOrigin: webOrigin, orderUrl, trackingUrl: orderUrl, supportUrl: orderUrl }, transport)
    .catch(() => null);

  if (receipt?.status !== 'accepted') return { status: 'unconfirmed', deliveryId: row.id } as const;
  await queue.update({
    where: { id: row.id },
    data: {
      state: NotificationDeliveryState.SENT,
      sentAt: new Date(Math.max(Date.now(), lastAttemptAt.getTime())),
      providerMessageId: receipt.messageId,
    },
  });
  return { status: 'sent', deliveryId: row.id, httpStatus: receipt.httpStatus } as const;
}

@Injectable()
export class C001QaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(C001QaService.name);
  private settings?: C001QaSettings;
  private timer?: NodeJS.Timeout;
  private pending?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    try {
      const settings = readC001QaSettings(process.env);
      if (!settings) return;
      const transport = createConfiguredCommercialMailTransport(process.env);
      this.settings = settings;
      this.timer = setInterval(() => {
        if (this.pending) return;
        this.pending = this.poll(settings, transport).finally(() => { this.pending = undefined; });
      }, POLL_MS);
      this.timer.unref();
    } catch {
      this.logger.error('C001_QA_CONFIG_INVALID');
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.pending;
  }

  isEnabledFor(operationId: string): boolean {
    return this.settings?.operationId === operationId;
  }

  async completePaidOperation(operation: Operation, order: SalesOrder, completedAt: Date): Promise<Operation> {
    if (!this.settings) throw unavailable();
    try {
      return await completeC001QaOperation(this.prisma, this.settings, operation, order, completedAt);
    } catch {
      this.logger.warn('C001_QA_CONFIRMATION_UNAVAILABLE');
      throw unavailable();
    }
  }

  private async poll(settings: C001QaSettings, transport: CommercialMailTransport): Promise<void> {
    try {
      const result = await processC001QaDelivery(this.prisma.notificationDelivery, settings, transport);
      if (result.status === 'sent') this.logger.log(result);
      if (result.status === 'unconfirmed' || result.status === 'invalid_snapshot') this.logger.warn(result);
    } catch {
      this.logger.error('C001_QA_QUEUE_UNAVAILABLE');
    }
  }
}
