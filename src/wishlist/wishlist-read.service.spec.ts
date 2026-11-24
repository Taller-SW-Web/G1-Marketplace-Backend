import { WishlistReadService } from './wishlist-read.service';
import { PrismaService } from '../prisma/prisma.service';
import { WishlistCatalog, ProductProjection } from '../catalog/wishlist-catalog';

describe('Wishlist reading: bounded enrichment and stable ownership/order', () => {
  const rows = Array.from({ length: 9 }, (_, index) => ({ productId: `P${index}`, createdAt: new Date(2026, 0, 9 - index) }));
  const projection: ProductProjection = { name: 'Producto', slug: 'producto', brand: null, image: null,
    price: null, availability: 'AVAILABLE' };
  const findMany = jest.fn();
  const project = jest.fn();
  const service = new WishlistReadService({ wishlistItem: { findMany } } as unknown as PrismaService,
    { project } as unknown as WishlistCatalog);
  beforeEach(() => { jest.resetAllMocks(); findMany.mockResolvedValue(rows); });

  it('limits projections to four, preserves database order despite reverse completion, and scopes the query', async () => {
    let active = 0; let peak = 0;
    const pending: Array<() => void> = [];
    project.mockImplementation(async () => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>(resolve => {
        pending.push(resolve);
        setImmediate(() => { while (pending.length) pending.pop()!(); });
      }); active--;
      return projection;
    });
    const result = await service.list('owner-A');
    expect(peak).toBe(4);
    expect(result.map(row => row.productId)).toEqual(rows.map(row => row.productId));
    expect(findMany).toHaveBeenCalledWith({ where: { customerId: 'owner-A' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { productId: true, createdAt: true } });
  });
  it('returns confirmed empty without catalog requests', async () => {
    findMany.mockResolvedValue([]);
    await expect(service.list('owner-A')).resolves.toEqual([]); expect(project).not.toHaveBeenCalled();
  });
  it('does not schedule later batches after a provider failure or return a partial collection', async () => {
    project.mockResolvedValue(projection).mockRejectedValueOnce(new Error('private-upstream-detail'));
    await expect(service.list('owner-A')).rejects.toMatchObject({ status: 503,
      response: { code: 'CATALOG_UNAVAILABLE', message: 'Catálogo no disponible' } });
    expect(project).toHaveBeenCalledTimes(4);
  });
  it('fails closed on malformed projection instead of presenting an empty collection', async () => {
    project.mockResolvedValue({ ...projection, price: { amount: NaN, currency: 'PEN' } });
    await expect(service.list('owner-A')).rejects.toMatchObject({ status: 503 });
    expect(project).toHaveBeenCalledTimes(4);
  });
});
