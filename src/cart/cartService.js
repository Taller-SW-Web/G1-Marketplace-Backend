const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Servicio de Carrito de Compras (F-016 y F-019)
 * Cumple con transaccionalidad, versionado optimista y aislamiento de datos.
 */

/**
 * Obtener o crear carrito activo para la sesión o cliente
 */
async function getOrCreateCart(tx, { sessionHash, customerId }) {
  let cart = null;

  if (customerId) {
    cart = await tx.cart.findFirst({
      where: { customerId, state: 'ACTIVE' },
      include: { items: true },
    });
  } else if (sessionHash) {
    cart = await tx.cart.findFirst({
      where: { anonymousSessionHash: sessionHash, state: 'ACTIVE' },
      include: { items: true },
    });
  }

  if (!cart) {
    cart = await tx.cart.create({
      data: {
        customerId: customerId || null,
        anonymousSessionHash: sessionHash || null,
        state: 'ACTIVE',
        currency: 'PEN',
        version: 1,
      },
      include: { items: true },
    });
  }

  return cart;
}

/**
 * TASK-F016-BE-001: Agregar ítem al carrito
 * Muta Cart/CartItem en transacción segura e incrementa Cart.version
 */
async function addItemToCart({ sessionHash, customerId, sku, quantity = 1 }) {
  if (!sku || typeof sku !== 'string' || sku.trim() === '') {
    const error = new Error('El parámetro sku es requerido.');
    error.status = 400;
    error.code = 'INVALID_SKU';
    throw error;
  }

  const parsedQty = parseInt(quantity, 10);
  if (isNaN(parsedQty) || parsedQty < 1 || parsedQty > 99) {
    const error = new Error('La cantidad debe ser un entero entre 1 y 99.');
    error.status = 400;
    error.code = 'INVALID_QUANTITY';
    throw error;
  }

  return await prisma.$transaction(async (tx) => {
    const cart = await getOrCreateCart(tx, { sessionHash, customerId });

    // Buscar si el SKU ya existe en este carrito
    const existingItem = await tx.cartItem.findUnique({
      where: {
        cartId_sku: {
          cartId: cart.id,
          sku: sku.trim(),
        },
      },
    });

    let isCreated = false;

    if (existingItem) {
      // Incrementar cantidad existente
      const newQuantity = existingItem.quantity + parsedQty;
      if (newQuantity > 99) {
        const error = new Error('La cantidad excede el límite permitido de 99 unidades por ítem.');
        error.status = 409;
        error.code = 'STOCK_LIMIT_REACHED';
        throw error;
      }

      await tx.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      // Crear nueva línea
      isCreated = true;
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          sku: sku.trim(),
          quantity: parsedQty,
          unitPriceSnapshot: 89.90, // Precio informativo para Hito 3 MOCK
          priceVersion: '1',
          quotedAt: new Date(),
        },
      });
    }

    // Incrementar versión del carrito
    const updatedCart = await tx.cart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
      include: { items: true },
    });

    return {
      status: isCreated ? 201 : 200,
      code: isCreated ? 'ITEM_CREATED' : 'ITEM_INCREMENTED',
      data: {
        cartId: updatedCart.id,
        version: updatedCart.version,
        items: updatedCart.items.map((it) => ({
          sku: it.sku,
          quantity: it.quantity,
          unitPrice: it.unitPriceSnapshot
            ? {
                amount: Number(it.unitPriceSnapshot),
                currency: updatedCart.currency,
                version: parseInt(it.priceVersion || '1', 10),
              }
            : undefined,
        })),
      },
    };
  });
}

/**
 * TASK-F019-BE-001: Obtener carrito actual
 * Consulta líneas y devuelve snapshot sin mutar cantidades
 */
async function getCurrentCart({ sessionHash, customerId }) {
  let cart = null;

  if (customerId) {
    cart = await prisma.cart.findFirst({
      where: { customerId, state: 'ACTIVE' },
      include: { items: true },
    });
  } else if (sessionHash) {
    cart = await prisma.cart.findFirst({
      where: { anonymousSessionHash: sessionHash, state: 'ACTIVE' },
      include: { items: true },
    });
  }

  if (!cart) {
    return {
      cartId: null,
      version: 0,
      items: [],
    };
  }

  return {
    cartId: cart.id,
    version: cart.version,
    items: cart.items.map((it) => ({
      sku: it.sku,
      quantity: it.quantity,
      unitPrice: it.unitPriceSnapshot
        ? {
            amount: Number(it.unitPriceSnapshot),
            currency: cart.currency,
            version: parseInt(it.priceVersion || '1', 10),
          }
        : undefined,
    })),
  };
}

module.exports = {
  prisma,
  getOrCreateCart,
  addItemToCart,
  getCurrentCart,
};
