import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityUserEvent } from './security-user-event';
import { SecurityUserEventInboxService } from './security-user-event-inbox.service';
import { SecurityUserReactionService } from './security-user-reaction.service';

function makeEvent(
  eventType: SecurityUserEvent['eventType'],
  userId = '11111111-1111-4111-8111-111111111111',
  eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
): SecurityUserEvent {
  return {
    eventId,
    eventType,
    version: 1,
    occurredAt: '2026-11-26T15:00:00.000Z',
    userId,
    data: eventType === 'usuario.roles_cambiados' ? { roles: ['CLIENTE'] } : {},
    payloadSha256: 'a'.repeat(64),
  };
}

describe('SecurityUserReactionService', () => {
  const tx = {
    securityUserState: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({})),
    },
    authSession: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    wishlistItem: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    cartItem: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    cart: {
      deleteMany: jest.fn(async () => ({ count: 1 })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    securityUserState: { findUnique: jest.fn() },
  } as unknown as PrismaService;
  const inbox = {
    recordWithClient: jest.fn(async () => 'recorded' as const),
  } as unknown as SecurityUserEventInboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    (inbox.recordWithClient as jest.Mock).mockResolvedValue('recorded');
    tx.securityUserState.findUnique.mockResolvedValue(null);
  });

  it('invalidates sessions and purges cart/wishlist on usuario.bloqueado preserving checkout carts', async () => {
    const service = new SecurityUserReactionService(prisma, inbox);
    const event = makeEvent('usuario.bloqueado');

    await expect(service.handleEvent(event)).resolves.toBe('recorded');
    expect(tx.securityUserState.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: event.userId },
      create: expect.objectContaining({ status: 'BLOCKED' }),
    }));
    expect(tx.authSession.deleteMany).toHaveBeenCalledWith({ where: { customerId: event.userId } });
    expect(tx.wishlistItem.deleteMany).toHaveBeenCalledWith({ where: { customerId: event.userId } });
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({ where: { cart: { customerId: event.userId } } });
    expect(tx.cart.deleteMany).toHaveBeenCalledWith({ where: { customerId: event.userId, checkoutOperations: { none: {} } } });
    expect(tx.cart.updateMany).toHaveBeenCalledWith({
      where: { customerId: event.userId, checkoutOperations: { some: {} }, state: 'ACTIVE' },
      data: { state: 'ABANDONED' },
    });
  });

  it('preserves active BLOCKED status when usuario.roles_cambiados arrives', async () => {
    tx.securityUserState.findUnique.mockResolvedValueOnce({ status: 'BLOCKED' } as never);
    const service = new SecurityUserReactionService(prisma, inbox);

    await service.handleEvent(makeEvent('usuario.roles_cambiados'));
    expect(tx.securityUserState.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'BLOCKED' }),
    }));
  });

  it('handles usuario.eliminado and usuario.roles_cambiados atomically', async () => {
    const service = new SecurityUserReactionService(prisma, inbox);

    await service.handleEvent(makeEvent('usuario.eliminado'));
    expect(tx.securityUserState.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'DEACTIVATED' }),
    }));

    await service.handleEvent(makeEvent('usuario.roles_cambiados'));
    expect(tx.securityUserState.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'ROLE_CHANGED' }),
    }));
  });

  it('skips side effects on duplicate events (idempotency)', async () => {
    (inbox.recordWithClient as jest.Mock).mockResolvedValue('duplicate');
    const service = new SecurityUserReactionService(prisma, inbox);

    await expect(service.handleEvent(makeEvent('usuario.bloqueado'))).resolves.toBe('duplicate');
    expect(tx.securityUserState.upsert).not.toHaveBeenCalled();
    expect(tx.authSession.deleteMany).not.toHaveBeenCalled();
    expect(tx.wishlistItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.cart.deleteMany).not.toHaveBeenCalled();
  });

  it('restores ACTIVE status on usuario.desbloqueado without clearing invalidatedAt', async () => {
    const service = new SecurityUserReactionService(prisma, inbox);
    await service.handleEvent(makeEvent('usuario.desbloqueado'));
    expect(tx.securityUserState.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: 'ACTIVE' }),
    }));
  });

  it('blocks BLOCKED/DEACTIVATED users and stale ROLE_CHANGED tokens in assertUserAllowed', async () => {
    const service = new SecurityUserReactionService(prisma, inbox);
    const findUnique = prisma.securityUserState.findUnique as jest.Mock;

    findUnique.mockResolvedValueOnce(null);
    await expect(service.assertUserAllowed('u1')).resolves.toBeUndefined();

    findUnique.mockResolvedValueOnce({ status: 'BLOCKED', invalidatedAt: new Date() });
    await expect(service.assertUserAllowed('u1')).rejects.toThrow(ForbiddenException);

    findUnique.mockResolvedValueOnce({ status: 'DEACTIVATED', invalidatedAt: new Date() });
    await expect(service.assertUserAllowed('u1')).rejects.toThrow(ForbiddenException);

    const invalidatedAt = new Date('2026-11-26T15:00:00.000Z');
    findUnique.mockResolvedValueOnce({ status: 'ROLE_CHANGED', invalidatedAt });
    await expect(service.assertUserAllowed('u1', invalidatedAt.getTime() - 1000)).rejects.toThrow(UnauthorizedException);

    findUnique.mockResolvedValueOnce({ status: 'ROLE_CHANGED', invalidatedAt });
    await expect(service.assertUserAllowed('u1', invalidatedAt.getTime() + 1000)).resolves.toBeUndefined();
  });
});
