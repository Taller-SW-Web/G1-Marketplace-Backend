import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

// Compra de homologación por el BFF desplegado: Ventas (G5) REAL; catálogo de checkout,
// cotización y revalidación MOCK (fixture CHECKOUT_G5_TEST_FIXTURE). El accessToken de la
// cuenta A sale del flujo de G7 y vive solo en memoria: nunca se imprime ni se escribe.
export const DEFAULT_BFF = 'https://g1-marketplace-backend.onrender.com';
export const DEFAULT_G7 = 'https://g7-auth-service.onrender.com/api/v1';
export const LIMITS = { G7: 6, BFF: 20 };
const MAX_OPERATION_READS = 4;
const MAX_WAIT_SECONDS = 120;
const QUOTE_PREFIX = 'Q-G5-MOCK-';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ConfigurationError extends Error {}
class Stop extends Error {
  constructor(message, outcome = 'DETENIDA') { super(message); this.outcome = outcome; }
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new ConfigurationError('Falta ' + name);
  return value;
}

function cents(env, name, min) {
  const value = required(env, name);
  if (!/^\d{1,9}$/.test(value) || Number(value) < min) throw new ConfigurationError(name + ' debe ser un entero de céntimos ≥ ' + min + '.');
  return Number(value);
}

export function configure(env = process.env, argv = process.argv.slice(2)) {
  const mode = (env.BUY_MODE ?? 'real').toLowerCase();
  if (!['mock', 'real'].includes(mode)) throw new ConfigurationError('BUY_MODE debe ser mock o real.');
  const urls = {};
  for (const [name, fallback] of [['BUY_BFF_URL', DEFAULT_BFF], ['BUY_G7_URL', DEFAULT_G7]]) {
    try { urls[name] = new URL(env[name]?.trim() || fallback); }
    catch { throw new ConfigurationError(name + ' no es válida.'); }
    const url = urls[name];
    if (url.username || url.password || url.search || url.hash) throw new ConfigurationError(name + ' no admite credenciales ni query.');
  }
  const bff = urls.BUY_BFF_URL;
  const g7 = urls.BUY_G7_URL;
  const g7Base = g7.origin + g7.pathname.replace(/\/$/, '');
  if (bff.pathname !== '/') throw new ConfigurationError('BUY_BFF_URL debe ser solo el origen del BFF.');
  if (mode === 'real') {
    if (env.BUY_REAL_AUTHORIZED !== '1') {
      throw new ConfigurationError('REAL requiere BUY_REAL_AUTHORIZED=1 con la ventana autorizada por Ventas y G7.');
    }
    if (bff.origin !== DEFAULT_BFF || g7Base !== DEFAULT_G7) {
      throw new ConfigurationError('REAL solo admite el BFF desplegado y el G7 aprobados.');
    }
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new ConfigurationError('REAL requiere verificación TLS habilitada.');
  } else if ([bff, g7].some((url) => url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new ConfigurationError('MOCK solo admite servicios locales por HTTP.');
  }

  const unknown = argv.filter((arg) => arg !== '--hasta-preparacion');
  if (unknown.length) throw new ConfigurationError('Opción desconocida: ' + unknown[0]);
  const untilPreparation = argv.includes('--hasta-preparacion');
  const sku = required(env, 'BUY_SKU');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(sku)) throw new ConfigurationError('BUY_SKU no es válido.');
  const account = { email: required(env, 'BUY_EMAIL'), password: required(env, 'BUY_PASSWORD') };
  if (!emailPattern.test(account.email)) throw new ConfigurationError('BUY_EMAIL no es válido.');

  let contact;
  if (!untilPreparation) {
    contact = {
      fullName: required(env, 'BUY_CONTACT_NAME'), documentType: required(env, 'BUY_CONTACT_DOC_TYPE').toUpperCase(),
      documentNumber: required(env, 'BUY_CONTACT_DOC_NUMBER'), phone: required(env, 'BUY_CONTACT_PHONE'),
      email: required(env, 'BUY_CONTACT_EMAIL'),
    };
    // Mismas reglas que CheckoutContactDto del BFF: un rechazo allí dejaría la operación a medias.
    if (contact.fullName.length < 2 || contact.fullName.length > 120 ||
      !['DNI', 'RUC', 'CE', 'PASAPORTE'].includes(contact.documentType) ||
      contact.documentNumber.length < 5 || contact.documentNumber.length > 24 ||
      contact.phone.length < 5 || contact.phone.length > 40 || !emailPattern.test(contact.email)) {
      throw new ConfigurationError('Contacto de prueba inválido (nombre, DNI/RUC/CE/PASAPORTE, documento, teléfono y correo).');
    }
  }
  const bffSha = env.BUY_BFF_SHA?.trim() || null;
  if (bffSha && !/^[0-9a-f]{7,40}$/i.test(bffSha)) throw new ConfigurationError('BUY_BFF_SHA debe ser un SHA de git.');
  return {
    mode: mode.toUpperCase(), bffBase: bff.origin + '/api/v1', bffOrigin: bff.origin, g7Base, untilPreparation,
    expected: { sku, unitPriceCents: cents(env, 'BUY_UNIT_PRICE_CENTS', 1), shippingCents: cents(env, 'BUY_SHIPPING_CENTS', 0) },
    addressLabel: env.BUY_ADDRESS_LABEL?.trim() || null, bffSha, account, contact,
  };
}

export async function askConsole(prompt, { hidden = false } = {}) {
  if (!process.stdin.isTTY) return '';
  const output = hidden ? new Writable({ write(_chunk, _encoding, done) { done(); } }) : process.stderr;
  const terminal = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 });
  try {
    if (hidden) process.stderr.write(prompt + ' (entrada oculta): ');
    return (await terminal.question(hidden ? '' : prompt + ': ')).trim();
  } finally {
    terminal.close();
    if (hidden) process.stderr.write('\n');
  }
}

export function limaTime(date) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const toCents = (money) => (record(money) && Number.isFinite(money.amount) ? Math.round(money.amount * 100) : NaN);
const errorCode = (value) => {
  const code = record(value?.error) ? value.error.code : value?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{3,60}$/.test(code) ? code : undefined;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryAfterSeconds = (headers) => {
  const value = headers?.get('retry-after');
  return /^\d{1,6}$/.test(value ?? '') ? Number(value) : null;
};

export async function run(config, { request = fetch, ask = askConsole, sleep = delay, log = () => {} } = {}) {
  const rows = [];
  const notes = [];
  const sensitive = new Set([config.account.password, config.account.email,
    ...Object.entries(config.contact ?? {}).filter(([name]) => name !== 'documentType').map(([, value]) => value)]
    .filter((value) => typeof value === 'string' && value.length >= 4));
  const counts = { G7: 0, BFF: 0 };
  const result = { outcome: 'DETENIDA', orderId: null, orderState: null, operationState: null };
  let tokens = null;

  const hide = (value) => { if (typeof value === 'string' && value.length >= 4) sensitive.add(value); return value; };
  const redact = (text) => [...sensitive].reduce((out, value) => out.split(value).join('[oculto]'), text);
  const say = (text) => log(redact(text));

  const tags = {
    g7: config.mode === 'REAL' ? 'G7 REAL' : 'G7 simulado (MOCK)',
    cart: config.mode === 'REAL' ? 'BFF REAL (carrito G1)' : 'BFF simulado (MOCK)',
    address: config.mode === 'REAL' ? 'Dirección G7 REAL vía BFF' : 'Dirección simulada (MOCK)',
    quote: 'Cotización y revalidación MOCK (fixture)',
    sales: config.mode === 'REAL' ? 'Ventas REAL' : 'Ventas simulada (MOCK)',
  };

  async function call(system, step, method, path, {
    route = path, body, bearer, idempotencyKey, timeoutMs = 30_000, expect, tag, tolerateTransport = false,
  }) {
    if (counts[system] >= LIMITS[system]) throw new Stop('Tope de ' + LIMITS[system] + ' solicitudes a ' + system + '.');
    counts[system] += 1;
    const requestId = randomUUID();
    const headers = { Accept: 'application/json', 'X-Request-Id': requestId };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const started = new Date();
    const row = { n: rows.length + 1, system, step, tag, method, route, lima: limaTime(started), at: started.toISOString(), requestId };
    const base = system === 'G7' ? config.g7Base : path === '/health' ? config.bffOrigin : config.bffBase;
    const t0 = performance.now();
    let response;
    let data;
    try {
      response = await request(base + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      });
      const raw = await response.text();
      try { data = raw === '' ? undefined : JSON.parse(raw); } catch { data = undefined; row.response = 'no-JSON'; }
    } catch (error) {
      row.ms = Math.round(performance.now() - t0);
      row.http = null;
      row.response = error?.name === 'TimeoutError' ? 'TIMEOUT_CLIENTE' : 'ERROR_DE_TRANSPORTE';
      row.result = tolerateTransport ? 'INCIERTO' : 'FAIL';
      rows.push(row);
      say(line(row));
      if (tolerateTransport) return { status: null, data: undefined, headers: null };
      throw new Stop(step + ': sin respuesta (' + row.response + ').');
    }
    row.ms = Math.round(performance.now() - t0);
    row.http = response.status;
    row.requestIdEchoed = response.headers.get('x-request-id') === requestId;
    const code = errorCode(data);
    if (code) row.code = code;
    row.result = [expect].flat().includes(response.status) ? 'OK' : 'INESPERADO';
    rows.push(row);
    return { status: response.status, data, headers: response.headers, row };
  }

  function finish(row, extra = {}) {
    Object.assign(row, extra);
    say(line(row));
  }

  function stopIfUnexpected(reply, step) {
    finish(reply.row);
    if (reply.status === 429) {
      throw new Stop(step + ': HTTP 429. Esperar ' + (retryAfterSeconds(reply.headers) ?? '?') + ' s y coordinar antes de repetir.');
    }
    if (reply.row.result !== 'OK') {
      throw new Stop(step + ': HTTP ' + reply.status + (reply.row.code ? ' ' + reply.row.code : '') + ' inesperado.');
    }
  }

  function failCheck(reply, step, reason) {
    reply.row.result = 'INESPERADO';
    say('     ✖ ' + reason);
    throw new Stop(step + ': ' + reason);
  }

  async function g7Login() {
    const login = await call('G7', 'G7 login cuenta A', 'POST', '/auth/login', {
      body: { correo: config.account.email, contrasena: config.account.password }, expect: 200, tag: tags.g7,
    });
    stopIfUnexpected(login, 'G7 login');
    let session = login.data;
    if (session?.mfaRequerido === true) {
      const challengeToken = hide(session.challengeToken);
      if (typeof challengeToken !== 'string' || !challengeToken) failCheck(login, 'G7 login', 'Desafío MFA sin token.');
      const requested = await call('G7', 'G7 solicitar OTP', 'POST', '/auth/otp/solicitar', {
        body: { challengeToken, canal: 'EMAIL' }, expect: [200, 202], tag: tags.g7,
      });
      stopIfUnexpected(requested, 'G7 solicitar OTP');
      const otp = await ask('OTP de seis dígitos que llegó al correo de la cuenta A', { hidden: true });
      if (!/^\d{6}$/.test(otp ?? '')) throw new Stop('OTP omitido o inválido: no se continúa.');
      hide(otp);
      const verified = await call('G7', 'G7 verificar OTP', 'POST', '/auth/otp/verificar', {
        body: { challengeToken, codigo: otp }, expect: 200, tag: tags.g7,
      });
      stopIfUnexpected(verified, 'G7 verificar OTP');
      session = verified.data;
    }
    if (typeof session?.accessToken !== 'string' || typeof session.refreshToken !== 'string' || session.tokenType !== 'Bearer') {
      throw new Stop('G7 no devolvió una sesión Bearer válida.');
    }
    tokens = { access: hide(session.accessToken), refresh: hide(session.refreshToken) };
    if (session.usuario?.id) hide(session.usuario.id);
  }

  async function g7Logout() {
    if (!tokens || counts.G7 >= LIMITS.G7) return;
    try {
      const reply = await call('G7', 'G7 cerrar sesión', 'POST', '/auth/logout', {
        body: { refreshToken: tokens.refresh }, bearer: tokens.access, expect: 204, tag: tags.g7,
      });
      finish(reply.row);
      if (reply.row.result !== 'OK') notes.push('El logout de G7 no se confirmó: cerrar la sesión de la cuenta A desde G7.');
    } catch {
      notes.push('El logout de G7 no respondió: cerrar la sesión de la cuenta A desde G7.');
    } finally {
      tokens = null;
    }
  }

  const orderView = (data) => ({
    state: data?.state ?? null,
    orderId: data?.orderId ?? data?.order?.orderId ?? null,
    orderState: data?.orderState ?? data?.order?.state ?? null,
    recoveryRequired: data?.recoveryRequired === true,
    failureCode: data?.failureCode ?? null,
  });

  function remember(view) {
    if (view.orderId) result.orderId = view.orderId;
    if (view.orderState) result.orderState = view.orderState;
    if (view.state) result.operationState = view.state;
  }

  async function purchase() {
    await g7Login();
    const bearer = tokens.access;

    const health = await call('BFF', 'Salud del BFF desplegado', 'GET', '/health', { expect: 200, tag: tags.cart });
    stopIfUnexpected(health, 'Salud del BFF');
    if (health.data?.status !== 'UP') failCheck(health, 'Salud del BFF', 'El BFF no está UP.');

    // 1. Carrito vacío, o exactamente el SKU aprobado con 1 unidad.
    const cart = await call('BFF', '1. Carrito actual', 'GET', '/carts/current', { bearer, expect: 200, tag: tags.cart });
    stopIfUnexpected(cart, 'Carrito actual');
    const items = cart.data?.data?.items;
    if (!Array.isArray(items) || !Number.isInteger(cart.data.data.version)) failCheck(cart, 'Carrito actual', 'Respuesta de carrito sin items/version.');
    let cartVersion = cart.data.data.version;
    const exact = items.length === 1 && items[0]?.sku === config.expected.sku && items[0].quantity === 1;
    if (items.length && !exact) {
      failCheck(cart, 'Carrito actual', 'El carrito tiene otros productos o cantidades: vaciarlo desde la web y repetir.');
    }
    if (exact) say('     Carrito ya contiene el SKU aprobado ×1: se omite el paso 2.');
    else {
      // 2. Un solo intento: reintentar a ciegas incrementaría la cantidad.
      const added = await call('BFF', '2. Agregar el SKU aprobado ×1', 'POST', '/carts/current/items', {
        bearer, body: { sku: config.expected.sku, quantity: 1 }, expect: 201, tag: tags.cart,
      });
      stopIfUnexpected(added, 'Agregar al carrito');
      const after = added.data?.data;
      if (added.data?.status !== 'ITEM_CREATED' || after?.items?.length !== 1 || after.items[0].sku !== config.expected.sku ||
        after.items[0].quantity !== 1 || !Number.isInteger(after.version)) {
        failCheck(added, 'Agregar al carrito', 'El carrito no quedó con exactamente el SKU aprobado ×1.');
      }
      cartVersion = after.version;
    }
    if (cart.data.data.cartId) hide(cart.data.data.cartId);

    // 3. Dirección de prueba de la cuenta A (titular derivado del token por el BFF).
    const addresses = await call('BFF', '3. Direcciones de la cuenta A', 'GET', '/checkout/delivery-addresses', {
      bearer, expect: 200, tag: tags.address,
    });
    stopIfUnexpected(addresses, 'Direcciones');
    const list = Array.isArray(addresses.data?.data) ? addresses.data.data : [];
    const candidates = config.addressLabel ? list.filter((item) => item?.label === config.addressLabel) : list;
    if (candidates.length !== 1 || typeof candidates[0]?.addressId !== 'string') {
      failCheck(addresses, 'Direcciones', config.addressLabel
        ? 'No hay exactamente una dirección con la etiqueta indicada.'
        : 'Hay ' + list.length + ' direcciones: indicar la etiqueta de la dirección de prueba.');
    }
    const addressId = hide(candidates[0].addressId);

    // 4. Cotización del fixture: se detiene si SKU, cantidad o montos no son los que Jim escribió.
    const quoteReply = await call('BFF', '4. Cotización', 'POST', '/checkout/quotes', {
      bearer, body: { addressId, cartVersion }, expect: 200, tag: tags.quote,
    });
    stopIfUnexpected(quoteReply, 'Cotización');
    const quote = quoteReply.data?.data;
    const expectedTotal = config.expected.unitPriceCents + config.expected.shippingCents;
    const line0 = quote?.lines?.[0];
    const checks = [
      [typeof quote?.quoteId === 'string' && quote.quoteId.startsWith(QUOTE_PREFIX), 'quoteId no es Q-G5-MOCK-…'],
      [quote?.lines?.length === 1 && line0?.sku === config.expected.sku && line0.quantity === 1, 'SKU o cantidad distintos'],
      [toCents(line0?.unitPrice) === config.expected.unitPriceCents && toCents(quote?.subtotal) === config.expected.unitPriceCents, 'precio unitario distinto'],
      [toCents(quote?.shipping) === config.expected.shippingCents, 'envío distinto'],
      [toCents(quote?.discount) === 0 && toCents(quote?.total) === expectedTotal, 'total distinto'],
      [quote?.total?.currency === 'PEN' && quote?.cartVersion === cartVersion, 'moneda o versión de carrito distintas'],
    ];
    const failed = checks.find(([ok]) => !ok);
    if (failed) failCheck(quoteReply, 'Cotización', 'No coincide con lo esperado (' + failed[1] + '). No se prepara.');
    hide(quote.quoteId);
    const quoteExpires = Date.parse(quote.expiresAt);
    Object.assign(quoteReply.row, { quote: { prefix: QUOTE_PREFIX, sku: line0.sku, quantity: 1, unitCents: config.expected.unitPriceCents,
      shippingCents: config.expected.shippingCents, totalCents: expectedTotal, expiresLima: limaTime(new Date(quoteExpires)) } });

    // 5. Preparación con la clave A.
    const keyA = hide(randomUUID());
    const prepared = await call('BFF', '5. Preparación (clave A)', 'POST', '/checkout/preparations', {
      bearer, idempotencyKey: keyA, body: { quoteId: quote.quoteId, cartVersion, simulationConfirmed: true },
      expect: [200, 201], tag: tags.quote,
    });
    stopIfUnexpected(prepared, 'Preparación');
    const operation = prepared.data?.data;
    if (operation?.state !== 'PREPARED' || operation.simulationConsent !== 'RECORDED' || !operation.revalidatedAt ||
      !uuidV4.test(operation.checkoutOperationId ?? '')) {
      failCheck(prepared, 'Preparación', 'La operación no quedó PREPARED y revalidada.');
    }
    const operationId = hide(operation.checkoutOperationId);
    prepared.row.operationState = 'PREPARED';
    result.operationState = 'PREPARED';

    if (config.untilPreparation) {
      result.outcome = 'PREPARADA_SIN_PEDIDO';
      notes.push('Ensayo --hasta-preparacion: no se envió el paso 6 ni se creó pedido en Ventas.');
      return;
    }

    // 6. Confirmación explícita antes de crear el pedido en Ventas.
    if (Date.now() > quoteExpires - 20_000) throw new Stop('La cotización vence en menos de 20 s: repetir desde el inicio.');
    say('     Pedido a crear: SKU ' + config.expected.sku + ' ×1 · total ' + (expectedTotal / 100).toFixed(2) +
      ' PEN · cotización vence ' + limaTime(new Date(quoteExpires)) + ' (Lima).');
    const confirmation = await ask('Esto CREA un pedido REAL en Ventas. Escribe CREAR PEDIDO para enviarlo');
    if (confirmation !== 'CREAR PEDIDO') {
      result.outcome = 'PREPARADA_SIN_PEDIDO';
      notes.push('Confirmación no recibida: no se creó pedido. La operación preparada vencerá con la cotización.');
      return;
    }
    const keyB = hide(randomUUID());
    const orderBody = { checkoutOperationId: operationId, contact: config.contact };
    const sendOrder = (label) => call('BFF', label, 'POST', '/checkout/orders', {
      bearer, idempotencyKey: keyB, body: orderBody, timeoutMs: 100_000, expect: [200, 202], tag: tags.sales,
      route: '/checkout/orders', tolerateTransport: true,
    });
    const readOperation = (label) => call('BFF', label, 'GET', '/checkout/operations/' + operationId, {
      bearer, timeoutMs: 100_000, expect: [200, 202, 429], tag: tags.sales,
      route: '/checkout/operations/{checkoutOperationId}', tolerateTransport: true,
    });

    let reply = await sendOrder('6. Crear pedido en Ventas (clave B)');
    let resent = false;
    let reads = 0;
    for (;;) {
      if (reply.status === null) {
        // Sin respuesta: primero se consulta la operación; nunca se genera otra clave.
        if (reads >= MAX_OPERATION_READS) break;
        await sleep(5_000);
        reads += 1;
        reply = await readOperation('Consultar operación tras timeout (' + reads + ')');
        if (reply.status === 409 && reply.row.code === 'ORDER_NOT_SUBMITTED' && !resent) {
          finish(reply.row, { note: 'El BFF no registró el envío: un reenvío con la misma clave B es seguro.' });
          resent = true;
          reply = await sendOrder('6b. Reenviar el mismo pedido (misma clave B)');
        }
        continue;
      }
      const view = orderView(reply.data?.data);
      remember(view);
      finish(reply.row, { operationState: view.state, orderState: view.orderState, orderId: view.orderId,
        recoveryRequired: view.recoveryRequired || undefined });
      if (![200, 202, 429].includes(reply.status)) {
        result.outcome = view.orderId ? 'PEDIDO_SIN_CONFIRMAR' : 'INCIERTO';
        throw new Stop('Respuesta HTTP ' + reply.status + (reply.row.code ? ' ' + reply.row.code : '') + ' al crear o consultar el pedido.', result.outcome);
      }
      if (reply.status === 200 && view.orderState === 'PAGADO' && view.state === 'SUCCEEDED') {
        result.outcome = 'PAGADO';
        return;
      }
      if (reply.status === 200 && (view.orderState === 'ANULADO' || view.state === 'FAILED')) {
        result.outcome = 'ANULADO';
        return;
      }
      if (reads >= MAX_OPERATION_READS) break;
      const wait = Math.min(MAX_WAIT_SECONDS, Math.max(5, retryAfterSeconds(reply.headers) ?? 0));
      say('     Estado no final (HTTP ' + reply.status + '): se consulta la operación en ' + wait + ' s, sin reenviar el pedido.');
      await sleep(wait * 1000);
      reads += 1;
      reply = await readOperation('Consultar operación (' + reads + ')');
    }
    result.outcome = result.orderId ? 'PEDIDO_SIN_CONFIRMAR' : 'INCIERTO';
    throw new Stop(result.orderId
      ? 'Pedido creado pero sin estado final tras ' + reads + ' consultas: no es PAGADO. Seguir con Ventas.'
      : 'Resultado incierto y sin ID de pedido: no reintentar; conciliar con Ventas con la hora y los X-Request-Id.', result.outcome);
  }

  let failure = null;
  try {
    await purchase();
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    failure = redact(error.message);
    if (error.outcome) result.outcome = error.outcome;
  } finally {
    await g7Logout();
  }
  if (result.outcome === 'PAGADO') notes.push('Pedido PAGADO en Ventas: pasar solo el ID de pedido a Ventas para la conciliación.');
  if (result.outcome === 'ANULADO') notes.push('Ventas anuló el pedido: 200 no implica PAGADO.');
  return { rows, counts, notes, failure, ...result, isClean: (text) => ![...sensitive].some((value) => text.includes(value)) };
}

function line(row) {
  const extra = [row.operationState && 'op=' + row.operationState, row.orderState && 'pedido=' + row.orderState,
    row.orderId && 'id=' + row.orderId, row.code].filter(Boolean).join(' ');
  return '#' + String(row.n).padStart(2, '0') + ' ' + row.lima + ' ' + row.system.padEnd(3) + ' ' + row.method.padEnd(4) + ' ' +
    row.route.padEnd(44) + ' ' + String(row.http ?? '---') + ' ' + row.requestId + ' ' + row.result + ' · ' + row.step +
    (extra ? ' · ' + extra : '');
}

export function renderMarkdown(report) {
  const lines = [
    '# Compra de homologación por el BFF · ' + report.mode, '',
    '- Etiquetas: **Ventas REAL** · **G7 REAL** (token y dirección) · **cotización y revalidación MOCK** (fixture `Q-G5-MOCK-`).',
    '- BFF `' + report.bffHost + '` · SHA live: ' + (report.bffSha ? '`' + report.bffSha + '`' : 'no informado (`/health` no expone SHA)'),
    '- Resultado: **' + report.outcome + '**' + (report.orderId ? ' · ID de pedido: `' + report.orderId + '`' : '') +
      (report.orderState ? ' · estado Ventas: ' + report.orderState : ''),
    ...(report.failure ? ['- Detenida: ' + report.failure] : []),
    '- Solicitudes: G7 ' + report.counts.G7 + '/' + LIMITS.G7 + ', BFF ' + report.counts.BFF + '/' + LIMITS.BFF, '',
    '| # | Paso | Hora Lima | Sistema | Ruta | HTTP | X-Request-Id | Estado operación / pedido | Etiqueta |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const row of report.cases) {
    lines.push('| ' + row.n + ' | ' + row.step + ' | ' + row.lima + ' | ' + row.system + ' | `' + row.method + ' ' + row.route + '` | ' +
      (row.http ?? row.response) + (row.code ? ' `' + row.code + '`' : '') + ' | `' + row.requestId + '` | ' +
      [row.operationState, row.orderState, row.orderId].filter(Boolean).join(' · ') + ' | ' + row.tag + ' |');
  }
  lines.push('', '## Notas', '', ...report.notes.map((note) => '- ' + note),
    '- HTTP 200 no implica PAGADO: el estado está en la columna de operación y pedido.',
    '- Sin token, cookies, claves de idempotencia, IDs de operación/cotización/dirección ni datos de contacto en este informe.', '');
  return lines.join('\n');
}

async function main() {
  const config = configure();
  if (!process.stdin.isTTY) throw new ConfigurationError('La compra necesita una terminal interactiva (OTP y confirmación).');
  const startedAt = new Date().toISOString();
  console.log(config.mode + ' · BFF ' + new URL(config.bffBase).host + (config.untilPreparation ? ' · ENSAYO hasta preparación (sin pedido)' : ' · con creación de pedido') +
    ' · ' + limaTime(new Date()) + ' Lima');
  const result = await run(config, { log: (text) => console.log(text) });
  const report = {
    mode: config.mode, bffHost: new URL(config.bffBase).host, bffSha: config.bffSha, startedAt,
    untilPreparation: config.untilPreparation, outcome: result.outcome, orderId: result.orderId, orderState: result.orderState,
    failure: result.failure, counts: result.counts, notes: result.notes, cases: result.rows,
  };
  const json = JSON.stringify(report, null, 2) + '\n';
  const markdown = renderMarkdown(report);
  if (!result.isClean(json) || !result.isClean(markdown)) throw new Error('Informe con datos sensibles: no se escribe.');
  const folder = 'docs/evidencias/H5/integracion-real/compra/' + startedAt.slice(0, 10);
  const name = folder + '/' + config.mode + '-' + startedAt.replaceAll(':', '-') + '-' + randomUUID().slice(0, 8);
  await mkdir(folder, { recursive: true });
  await writeFile(name + '.json', json, { flag: 'wx' });
  await writeFile(name + '.md', markdown, { flag: 'wx' });
  console.log('Resultado: ' + result.outcome + (result.orderId ? ' · ID de pedido ' + result.orderId : '') + '. Informe: ' + name + '.md');
  if (result.failure) console.error('Detenida: ' + result.failure);
  process.exitCode = { PAGADO: 0, PREPARADA_SIN_PEDIDO: result.failure ? 1 : 0, ANULADO: 2, PEDIDO_SIN_CONFIRMAR: 2, INCIERTO: 3 }[result.outcome] ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof ConfigurationError ? error.message : 'El script se detuvo por un error interno. No se imprimen detalles sensibles.');
    process.exitCode = 1;
  });
}
