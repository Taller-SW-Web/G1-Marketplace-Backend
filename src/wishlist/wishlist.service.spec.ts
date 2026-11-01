import { WishlistService } from './wishlist.service';
import { PrismaWishlistRepository } from './wishlist.repository';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('WishlistService', () => {
  const repository = { save: jest.fn(), remove: jest.fn() };
  const eligibility = { isActive: jest.fn() };
  const service = new WishlistService(repository, eligibility);
  beforeEach(() => jest.resetAllMocks());
  it('does not persist inactive products', async () => {
    eligibility.isActive.mockResolvedValue(false);
    await expect(service.save('customer', 'product')).rejects.toMatchObject({ status: 404 });
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('does not persist when eligibility fails', async () => {
    eligibility.isActive.mockRejectedValue(new Error('unavailable'));
    await expect(service.save('customer', 'product')).rejects.toThrow();
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('removes without consulting eligibility', async () => {
    await service.remove('customer', 'product');
    expect(repository.remove).toHaveBeenCalledWith('customer', 'product');
    expect(eligibility.isActive).not.toHaveBeenCalled();
  });
});

describe('PrismaWishlistRepository unique conflict handling', () => {
  const prisma = { wishlistItem: { create: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() } };
  const repository = new PrismaWishlistRepository(prisma as unknown as PrismaService);
  const conflict = (target: unknown) => new Prisma.PrismaClientKnownRequestError('conflict', {
    code: 'P2002', clientVersion: 'test', meta: { target },
  });
  beforeEach(() => jest.resetAllMocks());
  it('recovers only the expected unique conflict without updating timestamps', async () => {
    prisma.wishlistItem.create.mockRejectedValue(conflict(['customer_id', 'product_id']));
    prisma.wishlistItem.findUnique.mockResolvedValue({ id: 'existing' });
    expect(await repository.save('customer', 'product')).toEqual({ created: false });
    expect(prisma.wishlistItem.findUnique).toHaveBeenCalledWith({
      where: { customerId_productId: { customerId: 'customer', productId: 'product' } }, select: { id: true },
    });
  });
  it('does not hide other uniqueness errors', async () => {
    prisma.wishlistItem.create.mockRejectedValue(conflict(['id']));
    await expect(repository.save('customer', 'product')).rejects.toThrow();
    expect(prisma.wishlistItem.findUnique).not.toHaveBeenCalled();
  });
  it('does not report success if conflicting row vanished', async () => {
    prisma.wishlistItem.create.mockRejectedValue(conflict(['customer_id', 'product_id']));
    prisma.wishlistItem.findUnique.mockResolvedValue(null);
    await expect(repository.save('customer', 'product')).rejects.toThrow();
  });
});
