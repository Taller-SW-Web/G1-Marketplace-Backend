import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SecurityEventsModule } from '../src/security-events/security-events.module';
import { SecurityUserReactionService } from '../src/security-events/security-user-reaction.service';
import { AuthGuard } from '../src/security/auth.guard';
import { SessionStore } from '../src/auth/session.store';
import { issueSandboxToken, SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';
import { validateTestDatabase } from '../scripts/test-database';

if (process.env.H3_ALLOW_TEST_DATABASE_WRITES !== 'true' || process.env.NODE_ENV !== 'test'
  || process.env.DATABASE_URL !== validateTestDatabase({ TEST_DATABASE_URL: process.env.TEST_DATABASE_URL })) {
  throw new Error('Use the isolated PostgreSQL runner');
}

describe('Security user reactions PostgreSQL integration (BE #316)', () => {
  let prisma: PrismaService;
  let reactions: SecurityUserReactionService;
  let authGuard: AuthGuard;
  let sessionStore: SessionStore;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;
  const jwtSecret = 'test-sandbox-secret-32-chars-minimum!';
  const sessionKey = Buffer.alloc(32, 7).toString('base64');

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [() => ({
            NODE_ENV: 'test',
            H3_SANDBOX_ENABLED: true,
            H3_JWT_SECRET: jwtSecret,
            AUTH_SESSION_KEY: sessionKey,
          })],
        }),
        PrismaModule,
        SecurityEventsModule,
      ],
      providers: [SessionStore, AuthGuard],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    reactions = moduleRef.get(SecurityUserReactionService);
    authGuard = moduleRef.get(AuthGuard);
    sessionStore = moduleRef.get(SessionStore);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function cleanUser(customerId: string) {
    await prisma.checkoutOperation.deleteMany({ where: { customerId } });
    await prisma.authSession.deleteMany({ where: { customerId } });
    await prisma.wishlistItem.deleteMany({ where: { customerId } });
    await prisma.cartItem.deleteMany({ where: { cart: { customerId } } });
    await prisma.cart.deleteMany({ where: { customerId } });
    await prisma.securityUserState.deleteMany({ where: { userId: customerId } });
  }

  async function seedUser(customerId: string, sku: string, withCheckout = false) {
    await cleanUser(customerId);
    const sessionData = {
      kind: 'session' as const,
      tokens: {
        accessToken: 'a',
        refreshToken: 'r',
        tokenType: 'Bearer' as const,
        expiresIn: 3600,
        usuario: { id: customerId, nombreCompleto: 'Usuario Prueba', roles: ['CLIENTE'] },
      },
      accessExpiresAt: Date.now() + 3600000,
      scope: customerId,
    };
    const linkedSession = await sessionStore.create(sessionData, new Date(Date.now() + 3600000), customerId);
    const legacySession = await sessionStore.create(sessionData, new Date(Date.now() + 3600000));
    await prisma.wishlistItem.create({ data: { customerId, productId: `prod-${sku}` } });
    const cart = await prisma.cart.create({ data: { customerId } });
    await prisma.cartItem.create({ data: { cartId: cart.id, sku, quantity: 1 } });
    if (withCheckout) {
      await prisma.checkoutOperation.create({
        data: {
          customerId,
          cartId: cart.id,
          idempotencyKey: `idem-${sku}`,
          requestFingerprint: 'f'.repeat(64),
          state: 'PREPARED',
        },
      });
    }
    return { linkedSession, legacySession, cartId: cart.id };
  }

  it('invalidates sessions (including legacy NULL customer_id), preserves checkout history and isolates user B', async () => {
    const userA = SANDBOX_CUSTOMERS.A;
    const userB = SANDBOX_CUSTOMERS.B;
    const seededA = await seedUser(userA, 'SKU-A1', true);
    await seedUser(userB, 'SKU-B1', false);

    const eventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const roleEventId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    await prisma.securityUserEventInbox.deleteMany({ where: { eventId: { in: [eventId, roleEventId] } } });

    const res = await reactions.handleEvent({
      eventId,
      eventType: 'usuario.bloqueado',
      version: 1,
      occurredAt: new Date(Date.now() + 5000).toISOString(),
      userId: userA,
      data: { automatico: false, hasta: null },
      payloadSha256: 'b'.repeat(64),
    });
    expect(res).toBe('recorded');

    // Linked session deleted immediately; legacy NULL-customer_id session invalidated on read
    expect(await prisma.authSession.count({ where: { customerId: userA } })).toBe(0);
    const legacyRead = await sessionStore.locked(seededA.legacySession, async (s) => ({ result: s }));
    expect(legacyRead).toBeNull();

    // Wishlist and cart items purged, while checkout-linked cart is preserved as ABANDONED
    expect(await prisma.wishlistItem.count({ where: { customerId: userA } })).toBe(0);
    expect(await prisma.cartItem.count({ where: { cart: { customerId: userA } } })).toBe(0);
    const preservedCart = await prisma.cart.findUnique({ where: { id: seededA.cartId } });
    expect(preservedCart?.state).toBe('ABANDONED');
    expect(await prisma.checkoutOperation.count({ where: { customerId: userA } })).toBe(1);

    // Role change must preserve active BLOCKED status
    await reactions.handleEvent({
      eventId: roleEventId,
      eventType: 'usuario.roles_cambiados',
      version: 1,
      occurredAt: new Date(Date.now() + 6000).toISOString(),
      userId: userA,
      data: { roles: ['CLIENTE'] },
      payloadSha256: 'd'.repeat(64),
    });
    const stateA = await prisma.securityUserState.findUnique({ where: { userId: userA } });
    expect(stateA?.status).toBe('BLOCKED');

    const tokenA = issueSandboxToken(userA, jwtSecret);
    await expect(authGuard.authenticate(tokenA)).rejects.toThrow(ForbiddenException);

    // User B remains completely intact and authorized
    expect(await prisma.authSession.count({ where: { customerId: userB } })).toBe(1);
    expect(await prisma.wishlistItem.count({ where: { customerId: userB } })).toBe(1);
    expect(await prisma.cart.count({ where: { customerId: userB } })).toBe(1);
    const tokenB = issueSandboxToken(userB, jwtSecret);
    await expect(authGuard.authenticate(tokenB)).resolves.toEqual({ sub: userB });

    await cleanUser(userA);
    await cleanUser(userB);
  });

  it('acknowledges duplicate eventId inside PostgreSQL transaction without aborting or repeating purge', async () => {
    const userA = SANDBOX_CUSTOMERS.A;
    await seedUser(userA, 'SKU-A2', false);

    const eventId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await prisma.securityUserEventInbox.deleteMany({ where: { eventId } });

    const tokenBefore = issueSandboxToken(userA, jwtSecret);
    const occurredAt = new Date(Date.now() + 10000).toISOString();

    const first = await reactions.handleEvent({
      eventId,
      eventType: 'usuario.roles_cambiados',
      version: 1,
      occurredAt,
      userId: userA,
      data: { roles: ['CLIENTE'] },
      payloadSha256: 'c'.repeat(64),
    });
    expect(first).toBe('recorded');

    // Re-add an item to verify the duplicate event does not re-run purge
    await prisma.wishlistItem.create({ data: { customerId: userA, productId: 'prod-after-first' } });

    const duplicate = await reactions.handleEvent({
      eventId,
      eventType: 'usuario.roles_cambiados',
      version: 1,
      occurredAt,
      userId: userA,
      data: { roles: ['CLIENTE'] },
      payloadSha256: 'c'.repeat(64),
    });
    expect(duplicate).toBe('duplicate');
    expect(await prisma.wishlistItem.count({ where: { customerId: userA } })).toBe(1);

    await expect(authGuard.authenticate(tokenBefore)).rejects.toThrow(UnauthorizedException);
    await cleanUser(userA);
  });
});
