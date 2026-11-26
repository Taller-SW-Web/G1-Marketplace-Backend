import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMITS, configure, renderMarkdown, run } from '../scripts/compra-real.mjs';

// MOCK sin red: dobles de G7 y del BFF con las formas de respuesta de develop (carts y checkout).
const env = {
  BUY_MODE: 'real', BUY_REAL_AUTHORIZED: '1', BUY_SKU: 'SKU-AUR-01', BUY_UNIT_PRICE_CENTS: '12990', BUY_SHIPPING_CENTS: '1000',
  BUY_EMAIL: 'cuenta-a@example.invalid', BUY_PASSWORD: 'Clave-Doble-A-1!', BUY_CONTACT_NAME: 'Contacto Sintetico',
  BUY_CONTACT_DOC_TYPE: 'DNI', BUY_CONTACT_DOC_NUMBER: '00000001', BUY_CONTACT_PHONE: '+51900000001',
  BUY_CONTACT_EMAIL: 'contacto@example.invalid',
};
const base = {
  mode: 'MOCK', bffBase: 'http://127.0.0.1:10000/api/v1', bffOrigin: 'http://127.0.0.1:10000', g7Base: 'http://127.0.0.1:4590/api/v1',
  untilPreparation: false, expected: { sku: 'SKU-AUR-01', unitPriceCents: 12990, shippingCents: 1000 }, addressLabel: null, bffSha: null,
  account: { email: env.BUY_EMAIL, password: env.BUY_PASSWORD },
  contact: { fullName: 'Contacto Sintetico', documentType: 'DNI', documentNumber: '00000001', phone: '+51900000001', email: 'contacto@example.invalid' },
};
const ACCESS = 'eyJhbGciOiJSUzI1NiJ9.acceso-del-doble.firma';
const REFRESH = 'refresco-del-doble-0001';
const CHALLENGE = 'desafio-del-doble-0001';
const OPERATION = '7d0c3d55-6f0e-4a4b-9b1a-3f2a1c0d9e8f';
const ADDRESS = 'direccion-del-doble-0001';
const ORDER = 'PED-2026-000123';
const OTP = '481516';

function doubles(overrides = {}) {
  const calls = [];
  let quoteId;
  const request = async (url, options) => {
    const { pathname } = new URL(url);
    const system = url.includes(':4590') ? 'G7' : 'BFF';
    const path = pathname.replace('/api/v1', '');
    const key = system + ' ' + options.method + ' ' + (path.startsWith('/checkout/operations/') ? '/checkout/operations/{id}' : path);
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ key, headers: options.headers, body });
    const reply = (data, status = 200, headers = {}) => new Response(data === undefined ? null : JSON.stringify(data),
      { status, headers: { 'X-Request-Id': options.headers['X-Request-Id'], ...headers } });
    const n = calls.filter((call) => call.key === key).length;
    if (overrides[key]) {
      const custom = await overrides[key]({ reply, body, n, quoteId });
      if (custom) return custom;
    }
    switch (key) {
      case 'G7 POST /auth/login': return reply({ mfaRequerido: true, challengeToken: CHALLENGE, expiraEn: 300 });
      case 'G7 POST /auth/otp/solicitar': return reply({ canal: 'EMAIL' }, 202);
      case 'G7 POST /auth/otp/verificar': return body.codigo === OTP
        ? reply({ accessToken: ACCESS, refreshToken: REFRESH, tokenType: 'Bearer', expiresIn: 900, usuario: { id: '11111111-1111-4111-8111-111111111111', roles: ['CLIENTE'] } })
        : reply({ code: 'CODIGO_INVALIDO' }, 401);
      case 'G7 POST /auth/logout': return reply(undefined, 204);
      case 'BFF GET /health': return reply({ status: 'UP', service: 'g1-marketplace-backend' });
      case 'BFF GET /carts/current': return reply({ status: 'OK', data: { cartId: 'carrito-del-doble', version: 3, items: [] } });
      case 'BFF POST /carts/current/items': return reply({ status: 'ITEM_CREATED', data: { cartId: 'carrito-del-doble', version: 4,
        items: [{ sku: body.sku, quantity: 1, unitPrice: { amount: 129.9, currency: 'PEN', version: 1 } }] } }, 201);
      case 'BFF GET /checkout/delivery-addresses': return reply({ data: [{ addressId: ADDRESS, label: 'Prueba', street: 'Calle sintetica', district: 'Lima', province: 'Lima', department: 'Lima' }] });
      case 'BFF POST /checkout/quotes':
        quoteId = 'Q-G5-MOCK-0123456789abcdef-' + crypto.randomUUID();
        return reply({ data: { quoteId, expiresAt: new Date(Date.now() + 300_000).toISOString(),
          subtotal: { amount: 129.9, currency: 'PEN' }, discount: { amount: 0, currency: 'PEN' },
          shipping: { amount: 10, currency: 'PEN', estimatedDays: 2 }, total: { amount: 139.9, currency: 'PEN' },
          lines: [{ sku: 'SKU-AUR-01', quantity: 1, productId: 'prod-1', unitPrice: { amount: 129.9, currency: 'PEN' } }],
          addressId: body.addressId, cartVersion: body.cartVersion } });
      case 'BFF POST /checkout/preparations': return reply({ data: { checkoutOperationId: OPERATION, state: 'PREPARED',
        simulationConsent: 'RECORDED', revalidatedAt: new Date().toISOString() } }, 201);
      case 'BFF POST /checkout/orders': return reply({ data: { checkoutOperationId: OPERATION, state: 'SUCCEEDED', orderId: ORDER,
        orderState: 'PAGADO', total: { amount: 139.9, currency: 'PEN' }, createdAt: new Date().toISOString() } });
      case 'BFF GET /checkout/operations/{id}': return reply({ data: { state: 'SUCCEEDED',
        order: { orderId: ORDER, state: 'PAGADO', total: { amount: 139.9, currency: 'PEN' }, createdAt: new Date().toISOString() } } });
      default: return reply({ error: 'Ruta no encontrada' }, 404);
    }
  };
  return { request, calls, count: (key) => calls.filter((call) => call.key === key).length };
}

function harness(overrides, { confirmation = 'CREAR PEDIDO', config = base } = {}) {
  const fake = doubles(overrides);
  const asked = [];
  const slept = [];
  const logs = [];
  const promise = run(config, {
    request: fake.request,
    ask: async (prompt, options = {}) => { asked.push({ prompt, hidden: Boolean(options.hidden) }); return options.hidden ? OTP : confirmation; },
    sleep: async (ms) => { slept.push(ms); },
    log: (text) => logs.push(text),
  });
  return { fake, asked, slept, logs, promise };
}

function report(result) {
  return { mode: 'MOCK', bffHost: '127.0.0.1:10000', bffSha: null, outcome: result.outcome, orderId: result.orderId,
    orderState: result.orderState, failure: result.failure, counts: result.counts, notes: result.notes, cases: result.rows };
}

const SECRETS = [ACCESS, REFRESH, CHALLENGE, OPERATION, ADDRESS, OTP, env.BUY_PASSWORD, env.BUY_EMAIL,
  'Contacto Sintetico', '00000001', '+51900000001', 'contacto@example.invalid', 'carrito-del-doble', 'Q-G5-MOCK-0123456789abcdef-'];

test('configure exige autorización, hosts aprobados, montos en céntimos y contacto válido', () => {
  const config = configure(env, []);
  assert.equal(config.bffBase, 'https://g1-marketplace-backend.onrender.com/api/v1');
  assert.equal(config.g7Base, 'https://g7-auth-service.onrender.com/api/v1');
  assert.equal(configure(env, ['--hasta-preparacion']).untilPreparation, true);
  const { BUY_CONTACT_NAME: _omit, ...withoutContact } = env;
  assert.equal(configure(withoutContact, ['--hasta-preparacion']).contact, undefined);
  for (const [change, message, argv = []] of [
    [{ BUY_REAL_AUTHORIZED: '' }, /BUY_REAL_AUTHORIZED=1/],
    [{ BUY_BFF_URL: 'https://otro.example' }, /aprobados/],
    [{ BUY_G7_URL: 'https://g7-auth-service.onrender.com/api/v2' }, /aprobados/],
    [{ NODE_TLS_REJECT_UNAUTHORIZED: '0' }, /TLS/],
    [{ BUY_UNIT_PRICE_CENTS: '129.90' }, /céntimos/],
    [{ BUY_SHIPPING_CENTS: '-1' }, /céntimos/],
    [{ BUY_CONTACT_DOC_TYPE: 'LIBRETA' }, /Contacto/],
    [{ BUY_CONTACT_NAME: '' }, /BUY_CONTACT_NAME/],
    [{}, /Opción desconocida/, ['--sin-confirmar']],
    [{ BUY_MODE: 'mock' }, /MOCK solo admite/],
  ]) assert.throws(() => configure({ ...env, ...change }, argv), message);
});

test('MOCK: secuencia feliz con OTP oculto, claves A y B distintas, confirmación y logout de G7', async () => {
  const { fake, asked, logs, promise } = harness();
  const result = await promise;
  assert.equal(result.failure, null);
  assert.equal(result.outcome, 'PAGADO');
  assert.equal(result.orderId, ORDER);
  assert.deepEqual(asked.map((item) => item.hidden), [true, false]);
  assert.match(asked[1].prompt, /CREAR PEDIDO/);
  const prep = fake.calls.find((call) => call.key === 'BFF POST /checkout/preparations');
  const order = fake.calls.find((call) => call.key === 'BFF POST /checkout/orders');
  assert.match(prep.headers['Idempotency-Key'], /^[0-9a-f-]{8}-[0-9a-f]{4}-4/);
  assert.notEqual(prep.headers['Idempotency-Key'], order.headers['Idempotency-Key']);
  assert.deepEqual(Object.keys(order.body).sort(), ['checkoutOperationId', 'contact']);
  assert.ok(!('clienteId' in order.body) && !('paymentMethod' in order.body));
  assert.deepEqual(prep.body.simulationConfirmed, true);
  // Bearer de usuario en todo el carrito y checkout; sin cookies.
  assert.ok(fake.calls.filter((call) => call.key.startsWith('BFF') && call.key !== 'BFF GET /health')
    .every((call) => call.headers.Authorization === 'Bearer ' + ACCESS && !call.headers.Cookie));
  assert.equal(fake.count('G7 POST /auth/logout'), 1);
  assert.ok(result.counts.G7 <= LIMITS.G7 && result.counts.BFF <= LIMITS.BFF);
  const text = JSON.stringify(report(result)) + renderMarkdown(report(result)) + logs.join('\n');
  for (const secret of SECRETS) assert.ok(!text.includes(secret), 'filtró ' + secret);
  assert.ok(result.isClean(text));
  assert.match(renderMarkdown(report(result)), /Ventas REAL|Ventas simulada/);
  assert.match(renderMarkdown(report(result)), /ID de pedido: `PED-2026-000123`/);
});

test('MOCK: cotización con total distinto detiene antes de preparar y cierra la sesión de G7', async () => {
  const { fake, asked, promise } = harness({
    'BFF POST /checkout/quotes': ({ reply, body }) => reply({ data: { quoteId: 'Q-G5-MOCK-x-y', expiresAt: new Date(Date.now() + 300_000).toISOString(),
      subtotal: { amount: 129.9, currency: 'PEN' }, discount: { amount: 0, currency: 'PEN' }, shipping: { amount: 15, currency: 'PEN', estimatedDays: 2 },
      total: { amount: 144.9, currency: 'PEN' }, lines: [{ sku: 'SKU-AUR-01', quantity: 1, unitPrice: { amount: 129.9, currency: 'PEN' } }],
      addressId: body.addressId, cartVersion: body.cartVersion } }),
  });
  const result = await promise;
  assert.match(result.failure, /envío distinto/);
  assert.equal(fake.count('BFF POST /checkout/preparations'), 0);
  assert.equal(fake.count('BFF POST /checkout/orders'), 0);
  assert.equal(asked.filter((item) => !item.hidden).length, 0);
  assert.equal(fake.count('G7 POST /auth/logout'), 1);
});

test('MOCK: 202 del pedido → consulta la operación respetando Retry-After, sin reenviar ni nueva clave', async () => {
  const { fake, slept, promise } = harness({
    'BFF POST /checkout/orders': ({ reply }) => reply({ data: { checkoutOperationId: OPERATION, state: 'SUBMITTED', orderId: ORDER, orderState: 'CREADO' } }, 202, { 'Retry-After': '9' }),
    'BFF GET /checkout/operations/{id}': ({ reply, n }) => (n === 1
      ? reply({ data: { state: 'SUBMITTED', order: { orderId: ORDER, state: 'CREADO' } } }, 202) : undefined),
  });
  const result = await promise;
  assert.equal(result.outcome, 'PAGADO');
  assert.equal(fake.count('BFF POST /checkout/orders'), 1);
  assert.equal(fake.count('BFF GET /checkout/operations/{id}'), 2);
  assert.deepEqual(slept, [9000, 5000]);
});

test('MOCK: 429 del pedido → espera Retry-After y consulta la operación, nunca un segundo POST', async () => {
  const { fake, slept, promise } = harness({
    'BFF POST /checkout/orders': ({ reply }) => reply({ data: { checkoutOperationId: OPERATION, state: 'SUBMITTED' } }, 429, { 'Retry-After': '30' }),
  });
  const result = await promise;
  assert.equal(result.outcome, 'PAGADO');
  assert.equal(fake.count('BFF POST /checkout/orders'), 1);
  assert.deepEqual(slept, [30000]);
});

test('MOCK: timeout del pedido → consulta; si el BFF no registró el envío, reenvía una vez con la MISMA clave B', async () => {
  const { fake, promise } = harness({
    'BFF POST /checkout/orders': ({ n }) => {
      if (n === 1) throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
    },
    'BFF GET /checkout/operations/{id}': ({ reply }) => reply({ error: { code: 'ORDER_NOT_SUBMITTED' } }, 409),
  });
  const result = await promise;
  assert.equal(result.outcome, 'PAGADO');
  const orders = fake.calls.filter((call) => call.key === 'BFF POST /checkout/orders');
  assert.equal(orders.length, 2);
  assert.equal(orders[0].headers['Idempotency-Key'], orders[1].headers['Idempotency-Key']);
  assert.deepEqual(orders[0].body, orders[1].body);
});

test('MOCK: timeout sin ID de pedido tras las consultas → INCIERTO y parada, sin reenviar', async () => {
  const { fake, promise } = harness({
    'BFF POST /checkout/orders': () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); },
    'BFF GET /checkout/operations/{id}': ({ reply }) => reply({ data: { state: 'SUBMITTED', recoveryRequired: true } }, 202),
  });
  const result = await promise;
  assert.equal(result.outcome, 'INCIERTO');
  assert.match(result.failure, /conciliar con Ventas/);
  assert.equal(fake.count('BFF POST /checkout/orders'), 1);
  assert.equal(fake.count('BFF GET /checkout/operations/{id}'), 4);
  assert.equal(fake.count('G7 POST /auth/logout'), 1);
});

test('MOCK: 200 con ANULADO no se toma como PAGADO', async () => {
  const { promise } = harness({
    'BFF POST /checkout/orders': ({ reply }) => reply({ data: { checkoutOperationId: OPERATION, state: 'FAILED', orderId: ORDER, orderState: 'ANULADO', failureCode: 'PAGO_NO_COMPLETADO' } }),
  });
  const result = await promise;
  assert.equal(result.outcome, 'ANULADO');
  assert.ok(result.notes.some((note) => note.includes('200 no implica PAGADO')));
});

test('MOCK: sin la frase exacta CREAR PEDIDO no se envía el pedido', async () => {
  const { fake, promise } = harness({}, { confirmation: 'crear pedido' });
  const result = await promise;
  assert.equal(result.outcome, 'PREPARADA_SIN_PEDIDO');
  assert.equal(fake.count('BFF POST /checkout/orders'), 0);
  assert.equal(fake.count('G7 POST /auth/logout'), 1);
});

test('MOCK: --hasta-preparacion no pide confirmación ni crea pedido', async () => {
  const { fake, asked, promise } = harness({}, { config: { ...base, untilPreparation: true, contact: undefined } });
  const result = await promise;
  assert.equal(result.outcome, 'PREPARADA_SIN_PEDIDO');
  assert.equal(result.failure, null);
  assert.deepEqual(asked.map((item) => item.hidden), [true]);
  assert.equal(fake.count('BFF POST /checkout/orders'), 0);
});

test('MOCK: carrito con otros productos detiene sin agregar; carrito exacto salta el paso 2', async () => {
  const other = harness({ 'BFF GET /carts/current': ({ reply }) => reply({ status: 'OK', data: { cartId: 'c', version: 5,
    items: [{ sku: 'SKU-AUR-01', quantity: 2 }] } }) });
  const stopped = await other.promise;
  assert.match(stopped.failure, /vaciarlo/);
  assert.equal(other.fake.count('BFF POST /carts/current/items'), 0);

  const exact = harness({ 'BFF GET /carts/current': ({ reply }) => reply({ status: 'OK', data: { cartId: 'c', version: 5,
    items: [{ sku: 'SKU-AUR-01', quantity: 1 }] } }) });
  const done = await exact.promise;
  assert.equal(done.outcome, 'PAGADO');
  assert.equal(exact.fake.count('BFF POST /carts/current/items'), 0);
  assert.equal(exact.fake.calls.find((call) => call.key === 'BFF POST /checkout/quotes').body.cartVersion, 5);
});

test('MOCK: 429 de G7 detiene antes de tocar el BFF', async () => {
  const { fake, asked, promise } = harness({
    'G7 POST /auth/login': ({ reply }) => reply({ code: 'RATE_LIMITED' }, 429, { 'Retry-After': '60' }),
  });
  const result = await promise;
  assert.match(result.failure, /429/);
  assert.equal(fake.calls.filter((call) => call.key.startsWith('BFF')).length, 0);
  assert.equal(asked.length, 0);
});
