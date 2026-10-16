const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { addItemToCart, getCurrentCart, prisma } = require('../src/cart/cartService');

test('TASK-F016-BE-001 & TASK-F019-BE-001: Persistencia y lógica del Carrito', async (t) => {
  const testSession = 'test-session-' + crypto.randomUUID();
  const testSku = 'TEST-AERO-' + Date.now();

  await t.test('1. Crea nueva línea en el carrito (201 ITEM_CREATED)', async () => {
    const result = await addItemToCart({
      sessionHash: testSession,
      sku: testSku,
      quantity: 1,
    });

    assert.equal(result.status, 201);
    assert.equal(result.code, 'ITEM_CREATED');
    assert.ok(result.data.cartId);
    assert.equal(result.data.version, 2); // Creado en v1, actualizado a v2

    const item = result.data.items.find((i) => i.sku === testSku);
    assert.ok(item);
    assert.equal(item.quantity, 1);
  });

  await t.test('2. Mismo SKU incrementa cantidad y version (200 ITEM_INCREMENTED)', async () => {
    const result = await addItemToCart({
      sessionHash: testSession,
      sku: testSku,
      quantity: 2,
    });

    assert.equal(result.status, 200);
    assert.equal(result.code, 'ITEM_INCREMENTED');
    assert.equal(result.data.version, 3); // Incrementa versión

    const item = result.data.items.find((i) => i.sku === testSku);
    assert.ok(item);
    assert.equal(item.quantity, 3); // 1 previo + 2 nuevos
  });

  await t.test('3. Rechaza adición con cantidad inválida (400 INVALID_QUANTITY)', async () => {
    await assert.rejects(
      async () => {
        await addItemToCart({
          sessionHash: testSession,
          sku: testSku,
          quantity: 0,
        });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'INVALID_QUANTITY');
        return true;
      }
    );
  });

  await t.test('4. Consulta el carrito actual (TASK-F019-BE-001)', async () => {
    const cart = await getCurrentCart({ sessionHash: testSession });
    assert.ok(cart.cartId);
    assert.equal(cart.version, 3);
    assert.ok(cart.items.length >= 1);

    const item = cart.items.find((i) => i.sku === testSku);
    assert.ok(item);
    assert.equal(item.quantity, 3);
  });

  // Limpieza de datos de prueba
  t.after(async () => {
    const cart = await prisma.cart.findFirst({
      where: { anonymousSessionHash: testSession },
    });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await prisma.cart.delete({ where: { id: cart.id } });
    }
    await prisma.$disconnect();
  });
});
