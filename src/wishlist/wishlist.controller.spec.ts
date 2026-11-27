import { WishlistController } from './wishlist.controller';

describe('WishlistController (F-036..F-039)', () => {
  const identity = { customerId: 'cust-123' };

  function makeController() {
    const wishlist = { save: jest.fn(), remove: jest.fn() };
    const reader = { list: jest.fn() };
    const cart = { add: jest.fn() };
    return {
      controller: new WishlistController(wishlist as never, reader as never, cart as never),
      wishlist,
      reader,
      cart,
    };
  }

  it('list delegates customerId and rejects query params', async () => {
    const { controller, reader } = makeController();
    reader.list.mockResolvedValue({ items: [] });

    await expect(controller.list({ identity, query: {} } as never)).resolves.toEqual({ items: [] });
    expect(reader.list).toHaveBeenCalledWith('cust-123');

    await expect(controller.list({ identity, query: { page: '1' } } as never))
      .rejects.toMatchObject({ status: 400, response: { code: 'INVALID_REQUEST' } });
  });

  it('save sets 201 when created and 200 when idempotent, rejecting query params', async () => {
    const { controller, wishlist } = makeController();
    const res = { status: jest.fn() };

    wishlist.save.mockResolvedValueOnce({ created: true, productId: 'PROD-1' });
    await expect(controller.save({ productId: 'PROD-1' }, { identity, query: {} } as never, res))
      .resolves.toEqual({ productId: 'PROD-1' });
    expect(res.status).toHaveBeenCalledWith(201);

    wishlist.save.mockResolvedValueOnce({ created: false, productId: 'PROD-1' });
    await expect(controller.save({ productId: 'PROD-1' }, { identity, query: {} } as never, res))
      .resolves.toEqual({ productId: 'PROD-1' });
    expect(res.status).toHaveBeenCalledWith(200);

    await expect(controller.save({ productId: 'PROD-1' }, { identity, query: { extra: '1' } } as never, res))
      .rejects.toMatchObject({ status: 400, response: { code: 'INVALID_REQUEST' } });
  });

  it('remove delegates remove and rejects query params, content-length, or transfer-encoding', async () => {
    const { controller, wishlist } = makeController();
    wishlist.remove.mockResolvedValue(undefined);

    await expect(controller.remove('PROD-1', { identity, query: {}, headers: {} } as never))
      .resolves.toBeUndefined();
    expect(wishlist.remove).toHaveBeenCalledWith('cust-123', 'PROD-1');

    await expect(controller.remove('PROD-1', { identity, query: { a: '1' }, headers: {} } as never))
      .rejects.toMatchObject({ status: 400, response: { code: 'INVALID_REQUEST' } });
    await expect(controller.remove('PROD-1', { identity, query: {}, headers: { 'content-length': '5' } } as never))
      .rejects.toMatchObject({ status: 400, response: { code: 'INVALID_REQUEST' } });
    await expect(controller.remove('PROD-1', { identity, query: {}, headers: { 'transfer-encoding': 'chunked' } } as never))
      .rejects.toMatchObject({ status: 400, response: { code: 'INVALID_REQUEST' } });
  });

  it('addToCart delegates add and rejects bodies, query params, or idempotency-key', async () => {
    const { controller, cart } = makeController();
    cart.add.mockResolvedValue({ productId: 'PROD-1', cart: { cartId: 'c1', version: 1, items: [] } });

    await expect(controller.addToCart('PROD-1', { identity, query: {}, headers: {} } as never))
      .resolves.toMatchObject({ productId: 'PROD-1' });
    expect(cart.add).toHaveBeenCalledWith('cust-123', 'PROD-1');

    for (const req of [
      { identity, query: {}, headers: { 'content-length': '2' } },
      { identity, query: {}, headers: { 'transfer-encoding': 'chunked' } },
      { identity, query: { q: '1' }, headers: {} },
      { identity, query: {}, headers: { 'idempotency-key': 'k1' } },
    ]) {
      await expect(controller.addToCart('PROD-1', req as never))
        .rejects.toMatchObject({ status: 400, response: { code: 'INVALID_REQUEST' } });
    }
  });
});
