import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { isEmail } from 'class-validator';
import { deliverCommercialMail, type CommercialMailTransport } from '../../notifications/commercial-mail-delivery';
import { createConfiguredCommercialMailTransport } from '../../notifications/commercial-mail-transport';
import { PrismaService } from '../../prisma/prisma.service';
import { parseShipmentStatusUpdatedEvent } from './shipment-event';

const POLL_MS = 5000;

interface C002QaSettings {
  orderId: string;
  to: string;
  eventAfter: Date;
  webOrigin: string;
}

export function readC002QaSettings(env: NodeJS.ProcessEnv): C002QaSettings | null {
  if (env.C002_QA_ENABLED !== 'true' || env.BREVO_ENABLED !== 'true') return null;
  if (env.MAIL_PROVIDER !== 'brevo') throw new Error('C002_QA_REQUIRES_BREVO');

  const orderId = env.C002_QA_ORDER_ID?.trim();
  const to = env.C002_QA_TO?.trim();
  const after = env.C002_QA_EVENT_AFTER;
  const eventAfter = new Date(after ?? '');
  const origin = URL.parse(env.G1_WEB_ORIGIN ?? '');
  if (!orderId || !/^PED-\d{4}-\d{5}$/u.test(orderId) || !to || !isEmail(to) ||
      !after || Number.isNaN(eventAfter.valueOf()) ||
      ![eventAfter.toISOString(), eventAfter.toISOString().replace('.000Z', 'Z')].includes(after) ||
      !origin || origin.protocol !== 'https:' || origin.origin !== env.G1_WEB_ORIGIN) {
    throw new Error('C002_QA_CONFIG_INVALID');
  }

  return { orderId, to, eventAfter, webOrigin: origin.origin };
}

export async function processC002QaNotice(
  queue: PrismaService['shipmentMailNotice'],
  settings: C002QaSettings,
  transport: CommercialMailTransport,
) {
  const pending = {
    attemptedAt: null,
    sentAt: null,
    event: { orderId: settings.orderId, receivedAt: { gte: settings.eventAfter } },
  };
  const notice = await queue.findFirst({
    where: pending,
    orderBy: [{ queuedAt: 'asc' }, { eventId: 'asc' }],
    select: { eventId: true, event: { select: { payload: true } } },
  });
  if (!notice) return { status: 'idle' } as const;

  const event = parseShipmentStatusUpdatedEvent(notice.event.payload);
  if (!event ||
      event.eventId !== notice.eventId ||
      event.data.orderId !== settings.orderId ||
      event.data.publicStatus !== 'DESPACHADO') {
    return { status: 'invalid_event', eventId: notice.eventId } as const;
  }

  // Commit the claim before making the external call. A timeout or process
  // restart must leave the claim in place: Brevo may have accepted the request.
  const claim = await queue.updateMany({
    where: { ...pending, eventId: notice.eventId },
    data: { attemptedAt: new Date() },
  });
  if (claim.count !== 1) return { status: 'contended' } as const;

  const webOrigin = settings.webOrigin;
  const orderUrl = new URL('/mis-pedidos', webOrigin).href;
  const trackingUrl = new URL(`/mis-pedidos/${event.data.orderId}/seguimiento`, webOrigin).href;
  const receipt = await deliverCommercialMail({
    type: 'SHIPMENT_UPDATE',
    orderId: event.data.orderId,
    state: 'DESPACHADO',
    occurredAt: event.timestamp,
    ...(event.data.estimatedDeliveryDate ? { estimatedDelivery: event.data.estimatedDeliveryDate } : {}),
  }, settings.to, { marketplaceOrigin: webOrigin, orderUrl, trackingUrl, supportUrl: orderUrl }, transport)
    .catch(() => null);
  if (!receipt || receipt.status !== 'accepted') {
    return { status: 'unconfirmed', eventId: event.eventId } as const;
  }

  await queue.update({
    where: { eventId: event.eventId },
    data: { sentAt: new Date(), providerMessageId: receipt.messageId },
  });
  return { status: 'sent', eventId: event.eventId, httpStatus: receipt.httpStatus } as const;
}

@Injectable()
export class C002QaWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(C002QaWorker.name);
  private timer?: NodeJS.Timeout;
  private pending?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    try {
      const settings = readC002QaSettings(process.env);
      if (!settings) return;
      const transport = createConfiguredCommercialMailTransport(process.env);
      this.timer = setInterval(() => {
        if (this.pending) return;
        this.pending = this.poll(settings, transport).finally(() => { this.pending = undefined; });
      }, POLL_MS);
      this.timer.unref();
    } catch {
      this.logger.error('C002_QA_CONFIG_INVALID');
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.pending;
  }

  private async poll(settings: C002QaSettings, transport: CommercialMailTransport): Promise<void> {
    try {
      const result = await processC002QaNotice(this.prisma.shipmentMailNotice, settings, transport);
      if (result.status === 'sent') this.logger.log(result);
      if (result.status === 'unconfirmed' || result.status === 'invalid_event') this.logger.warn(result);
    } catch {
      this.logger.error('C002_QA_QUEUE_UNAVAILABLE');
    }
  }
}
