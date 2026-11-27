import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { ShipmentStatusUpdatedEvent } from './shipment-event';

@Injectable()
export class ShipmentWebhookQaFailure {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async consume(event: ShipmentStatusUpdatedEvent, correlationId: string): Promise<boolean> {
    if (this.config.get('VENTAS_WEBHOOK_QA_503_ENABLED') !== 'true') return false;

    const orderId = this.config.get<string>('VENTAS_WEBHOOK_QA_503_ORDER_ID') ?? '';
    if (!/^PED-(?:2099-\d{5}|\d{4}-9\d{4})$/u.test(orderId) || event.data.orderId !== orderId
        || orderId === this.config.get<string>('C002_QA_ORDER_ID')) return false;

    const expiry = this.config.get<string>('VENTAS_WEBHOOK_QA_503_EXPIRES_AT') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u.test(expiry)) return false;
    const expiresAt = new Date(expiry);
    if (!(expiresAt.getTime() > Date.now())
        || expiresAt.toISOString() !== (expiry.includes('.') ? expiry : expiry.replace('Z', '.000Z'))) return false;

    // Commit the marker before returning 503. The unique order ID limits this
    // to one use even after restarts or concurrent deliveries.
    const inserted = await this.prisma.$executeRaw`
      INSERT INTO shipment_webhook_qa_failure (order_id, event_id, correlation_id)
      SELECT ${orderId}, ${event.eventId}, ${correlationId}
      WHERE clock_timestamp() < ${expiresAt}::timestamptz
        AND NOT EXISTS (SELECT 1 FROM shipment_event_inbox WHERE event_id = ${event.eventId})
      ON CONFLICT (order_id) DO NOTHING
    `;
    return inserted === 1;
  }
}
