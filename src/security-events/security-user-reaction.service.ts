import { ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityUserEvent } from './security-user-event';
import {
  RecordSecurityUserEventResult,
  SecurityUserEventInboxService,
} from './security-user-event-inbox.service';

const INVALIDATION_STATUS_BY_EVENT: Record<string, string> = {
  'usuario.bloqueado': 'BLOCKED',
  'usuario.eliminado': 'DEACTIVATED',
  'usuario.desactivado': 'DEACTIVATED',
  'usuario.roles_cambiados': 'ROLE_CHANGED',
};

@Injectable()
export class SecurityUserReactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: SecurityUserEventInboxService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async handleEvent(event: SecurityUserEvent): Promise<RecordSecurityUserEventResult> {
    return this.prisma.$transaction(async (tx) => {
      const receipt = await this.inbox.recordWithClient(tx, event);
      if (receipt === 'duplicate') return 'duplicate';

      const invalidationStatus = INVALIDATION_STATUS_BY_EVENT[event.eventType];
      if (invalidationStatus) {
        const invalidatedAt = new Date(event.occurredAt);
        const existingState = await tx.securityUserState.findUnique({
          where: { userId: event.userId },
          select: { status: true },
        });
        // A role change must not downgrade an active BLOCKED or DEACTIVATED restriction.
        const effectiveStatus = event.eventType === 'usuario.roles_cambiados'
          && (existingState?.status === 'BLOCKED' || existingState?.status === 'DEACTIVATED')
          ? existingState.status
          : invalidationStatus;

        await tx.securityUserState.upsert({
          where: { userId: event.userId },
          create: {
            userId: event.userId,
            status: effectiveStatus,
            invalidatedAt,
            lastEventId: event.eventId,
            lastEventType: event.eventType,
          },
          update: {
            status: effectiveStatus,
            invalidatedAt,
            lastEventId: event.eventId,
            lastEventType: event.eventType,
          },
        });
        await tx.authSession.deleteMany({ where: { customerId: event.userId } });
        await tx.wishlistItem.deleteMany({ where: { customerId: event.userId } });
        await tx.cartItem.deleteMany({ where: { cart: { customerId: event.userId } } });
        // Preserve carts linked to checkout_operations to keep checkout history intact and avoid FK failure.
        await tx.cart.deleteMany({
          where: { customerId: event.userId, checkoutOperations: { none: {} } },
        });
        await tx.cart.updateMany({
          where: { customerId: event.userId, checkoutOperations: { some: {} }, state: 'ACTIVE' },
          data: { state: 'ABANDONED' },
        });
        return 'recorded';
      }

      if (event.eventType === 'usuario.desbloqueado' || event.eventType === 'usuario.reactivado') {
        await tx.securityUserState.upsert({
          where: { userId: event.userId },
          create: {
            userId: event.userId,
            status: 'ACTIVE',
            lastEventId: event.eventId,
            lastEventType: event.eventType,
          },
          update: {
            status: 'ACTIVE',
            lastEventId: event.eventId,
            lastEventType: event.eventType,
          },
        });
      }
      return 'recorded';
    });
  }

  async assertUserAllowed(userId: string, tokenIssuedAtMs?: number): Promise<void> {
    const enabled = this.config?.get<unknown>('SECURITY_EVENTS_ENABLED');
    if (this.config && enabled !== true && enabled !== 'true') return;

    const state = await this.prisma.securityUserState.findUnique({
      where: { userId },
      select: { status: true, invalidatedAt: true },
    });
    if (!state) return;

    if (state.status === 'BLOCKED' || state.status === 'DEACTIVATED') {
      throw new ForbiddenException({ error: { code: 'USER_ACCESS_BLOCKED' } });
    }
    if (state.status === 'ROLE_CHANGED' && state.invalidatedAt) {
      if (tokenIssuedAtMs === undefined || tokenIssuedAtMs < state.invalidatedAt.getTime()) {
        throw new UnauthorizedException({ error: { code: 'SESSION_INVALIDATED' } });
      }
    }
  }
}
