import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Operation = { operationId?: string; responses?: Record<string, unknown> };
type OpenApiDocument = {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

const root = join(__dirname, '..');
const contract = JSON.parse(
  readFileSync(join(root, 'docs/contratos/openapi-h3.json'), 'utf8'),
) as OpenApiDocument;
const cartController = readFileSync(join(root, 'src/cart/cart.controller.ts'), 'utf8');
const wishlistController = readFileSync(join(root, 'src/wishlist/wishlist.controller.ts'), 'utf8');

const implementedOperations = [
  { method: 'post', path: '/api/v1/carts/current/items', id: 'addCartItem', source: cartController, route: "@Post(['current/items', 'items'])" },
  { method: 'patch', path: '/api/v1/carts/current/items/{sku}', id: 'updateCartItemQuantity', source: cartController, route: "@Patch(['current/items/:sku', 'items/:sku'])" },
  { method: 'delete', path: '/api/v1/carts/current/items/{sku}', id: 'removeCartItem', source: cartController, route: "@Delete(['current/items/:sku', 'items/:sku'])" },
  { method: 'get', path: '/api/v1/carts/current', id: 'getCurrentCart', source: cartController, route: "@Get(['current', ''])" },
  { method: 'post', path: '/api/v1/carts/current/merge-anonymous', id: 'mergeAnonymousCart', source: cartController, route: "@Post(['current/merge-anonymous', 'merge-anonymous'])" },
  { method: 'post', path: '/api/v1/carts/current/items/{sku}/move-to-wishlist', id: 'moveCartItemToWishlist', source: cartController, route: "@Post(['current/items/:sku/move-to-wishlist', 'items/:sku/move-to-wishlist'])" },
  { method: 'get', path: '/api/v1/wishlist', id: 'listWishlist', source: wishlistController, route: "@Get()" },
  { method: 'post', path: '/api/v1/wishlist/items/{productId}/add-to-cart', id: 'addWishlistItemToCart', source: wishlistController, route: "@Post('items/:productId/add-to-cart')" },
  { method: 'post', path: '/api/v1/wishlist/items', id: 'saveWishlistItem', source: wishlistController, route: "@Post('items')" },
  { method: 'delete', path: '/api/v1/wishlist/items/{productId}', id: 'removeWishlistItem', source: wishlistController, route: "@Delete('items/:productId')" },
] as const;

describe('H3 cart and wishlist OpenAPI operation coverage', () => {
  it.each(implementedOperations)(
    '$method $path maps to $id and an implemented controller route',
    ({ method, path, id, source, route }) => {
      expect(contract.paths[path]?.[method]?.operationId).toBe(id);
      expect(source).toContain(route);
    },
  );

  it('keeps operationIds unique across the contract', () => {
    const operationIds = Object.values(contract.paths).flatMap((path) =>
      Object.values(path)
        .map((operation) => operation.operationId)
        .filter((operationId): operationId is string => Boolean(operationId)),
    );
    expect(new Set(operationIds).size).toBe(operationIds.length);
  });

  it('matches POST default and explicit response statuses from the controllers', () => {
    expect(contract.paths['/api/v1/carts/current/merge-anonymous'].post.responses).toHaveProperty('201');
    expect(contract.paths['/api/v1/carts/current/items/{sku}/move-to-wishlist'].post.responses).toHaveProperty('201');
    expect(contract.paths['/api/v1/carts/current/items/{sku}'].delete.responses).toHaveProperty('204');
    expect(contract.paths['/api/v1/wishlist/items/{productId}'].delete.responses).toHaveProperty('204');
  });

  it('documents the supported MOCK productId input and complete cart snapshot fields', () => {
    expect(contract.components.schemas.AddCartItemPayload.properties).toHaveProperty('sku');
    expect(contract.components.schemas.AddCartItemPayload.properties).toHaveProperty('productId');
    expect(contract.components.schemas.CartSnapshot.properties).toHaveProperty('subtotal');
    expect(contract.components.schemas.CartItemSnapshot.properties).toHaveProperty('product');
    expect(contract.components.schemas.CartItemSnapshot.properties).toHaveProperty('availability');
    expect(contract.components.schemas.CartItemSnapshot.properties).toHaveProperty('attention');
  });
});
