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
    // ON CONFLICT DO NOTHING avoids aborting an enclosing PostgreSQL transaction on duplicate eventId.
    const inserted = await client.$queryRaw<Array<{ event_id: string }>>`
      INSERT INTO "security_user_event_inbox" ("event_id", "event_type", "event_version", "payload_sha256")
      VALUES (${event.eventId}, ${event.eventType}, ${event.version}, ${event.payloadSha256})
      ON CONFLICT ("event_id") DO NOTHING
      RETURNING "event_id"
    `;
    if (inserted.length > 0) return 'recorded';

    const existing = await client.securityUserEventInbox.findUnique({
      where: { eventId: event.eventId },
      select: { eventType: true, eventVersion: true, payloadSha256: true },
    });
    if (!existing) throw new Error('security_user_event_inbox_lookup_failed');
    if (existing.eventType !== event.eventType || existing.eventVersion !== event.version
      || existing.payloadSha256 !== event.payloadSha256) {
      throw new SecurityUserEventIdentityConflictError();
    }
    return 'duplicate';
  }
}
