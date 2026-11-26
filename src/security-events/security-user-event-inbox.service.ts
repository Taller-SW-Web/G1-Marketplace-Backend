import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityUserEvent } from './security-user-event';

export type RecordSecurityUserEventResult = 'recorded' | 'duplicate';

export class SecurityUserEventIdentityConflictError extends Error {
  constructor() {
    super('event_id_payload_conflict');
    this.name = 'SecurityUserEventIdentityConflictError';
  }
}

@Injectable()
export class SecurityUserEventInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: SecurityUserEvent): Promise<RecordSecurityUserEventResult> {
    return this.recordWithClient(this.prisma, event);
  }

  async recordWithClient(
    client: Prisma.TransactionClient | PrismaService,
    event: SecurityUserEvent,
  ): Promise<RecordSecurityUserEventResult> {
    try {
      await client.securityUserEventInbox.create({
        data: {
          eventId: event.eventId,
          eventType: event.eventType,
          eventVersion: event.version,
          payloadSha256: event.payloadSha256,
        },
      });
      return 'recorded';
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;

      const existing = await client.securityUserEventInbox.findUnique({
        where: { eventId: event.eventId },
        select: { eventType: true, eventVersion: true, payloadSha256: true },
      });
      if (!existing) throw error;
      if (existing.eventType !== event.eventType || existing.eventVersion !== event.version
        || existing.payloadSha256 !== event.payloadSha256) {
        throw new SecurityUserEventIdentityConflictError();
      }
      return 'duplicate';
    }
  }

  private isUniqueConflict(error: unknown): boolean {
    return error !== null && typeof error === 'object' && 'code' in error
      && (error as { code?: unknown }).code === 'P2002';
  }
}
