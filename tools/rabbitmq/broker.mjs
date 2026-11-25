import { randomUUID } from 'node:crypto';

const exchange = 'seguridad.usuarios';
const queue = 'marketplace.usuarios';
const deadExchange = 'seguridad.usuarios.dlx';
const deadQueue = 'seguridad.usuarios.dlq';
const deadKey = 'descartado';
const publisher = 'g7_publicador';
const consumer = 'g1_consumidor';
const never = '^$';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

const eventData = new Map([
  ['usuario.creado', () => ({ roles: ['CLIENTE'] })],
  ['usuario.bloqueado', () => ({ automatico: false, hasta: null })],
  ['usuario.roles_cambiados', () => ({ roles: ['VENDEDOR', 'GESTOR_COMERCIAL'] })],
]);
const knownEvents = new Set([
  ...eventData.keys(), 'usuario.desactivado', 'usuario.reactivado',
  'usuario.desbloqueado', 'usuario.atributos_actualizados',
]);

class BrokerError extends Error {}

function requireEnv(env, name) {
  if (!env[name]?.trim()) throw new BrokerError('Falta la variable ' + name + '.');
  return env[name];
}

export function managementClient(env, request = fetch) {
  let base;
  try { base = new URL(requireEnv(env, 'RABBITMQ_MANAGEMENT_URL')); }
  catch (error) {
    if (error instanceof BrokerError) throw error;
    throw new BrokerError('RABBITMQ_MANAGEMENT_URL no es válida.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash ||
      !['/', '/api', '/api/'].includes(base.pathname) ||
      (base.protocol !== 'https:' && !(loopback && base.protocol === 'http:'))) {
    throw new BrokerError('Usa la URL HTTPS de management sin credenciales. HTTP solo en loopback.');
  }
  const user = requireEnv(env, 'RABBITMQ_ADMIN_USER');
  if (user.includes(':')) throw new BrokerError('El usuario de management no puede contener dos puntos.');
  const password = requireEnv(env, 'RABBITMQ_ADMIN_PASSWORD');
  const vhost = requireEnv(env, 'RABBITMQ_VHOST');
  if (vhost === '.' || vhost === '..') throw new BrokerError('El vhost no puede ser un segmento relativo.');
  const auth = 'Basic ' + Buffer.from(user + ':' + password, 'utf8').toString('base64');

  async function call(method, parts, body, operation, expectJson = false) {
    const path = '/api/' + parts.map(encodeURIComponent).join('/');
    let response;
    try {
      response = await request(base.origin + path, {
        method, headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BrokerError(operation + ': fallo de transporte. Comprueba el estado del broker antes de repetir.');
    }
    if (!response.ok) throw new BrokerError(operation + ': HTTP ' + response.status + '.');
    if (!expectJson) return;
    try {
      return await response.json();
    } catch {
      throw new BrokerError(operation + ': respuesta JSON inválida.');
    }
  }
  return { call, vhost };
}

async function configureAccounts(call, vhost, env) {
  if ([publisher, consumer].includes(env.RABBITMQ_ADMIN_USER)) {
    throw new BrokerError('Usa una cuenta de administración distinta de las cuentas de integración.');
  }
  const g7Password = requireEnv(env, 'RABBITMQ_G7_PUBLISHER_PASSWORD');
  const g1Password = requireEnv(env, 'RABBITMQ_G1_CONSUMER_PASSWORD');
  if (g7Password === g1Password || [g7Password, g1Password].includes(env.RABBITMQ_ADMIN_PASSWORD)) {
    throw new BrokerError('Usa contraseñas distintas para las tres cuentas.');
  }

  // En un plan compartido estos permisos no están disponibles. Fallar antes de tocar topología.
  await call('PUT', ['users', publisher], { password: g7Password, tags: '' }, 'Crear usuario G7');
  await call('PUT', ['users', consumer], { password: g1Password, tags: '' }, 'Crear usuario G1');
  await call('PUT', ['permissions', vhost, publisher],
    { configure: never, write: '^seguridad\\.usuarios$', read: never }, 'Asignar permisos G7');
  await call('PUT', ['permissions', vhost, consumer],
    { configure: '^marketplace\\.usuarios$', write: never, read: '^marketplace\\.usuarios$' },
    'Asignar permisos G1');
}

export async function setupBroker({ call, vhost }, env) {
  const mode = env.RABBITMQ_MODO ?? 'dos-usuarios';
  if (mode !== 'dos-usuarios' && mode !== 'un-usuario') {
    throw new BrokerError('RABBITMQ_MODO debe ser dos-usuarios o un-usuario.');
  }
  const shared = mode === 'un-usuario';
  if (!shared) await configureAccounts(call, vhost, env);

  await call('PUT', ['exchanges', vhost, exchange],
    { type: 'topic', durable: true, auto_delete: false, internal: false, arguments: {} }, 'Declarar exchange G7');
  await call('PUT', ['exchanges', vhost, deadExchange],
    { type: 'direct', durable: true, auto_delete: false, internal: false, arguments: {} }, 'Declarar exchange de descarte');
  const durableQueue = { durable: true, auto_delete: false, arguments: {} };
  await call('PUT', ['queues', vhost, deadQueue], durableQueue, 'Declarar cola de descarte');
  await call('POST', ['bindings', vhost, 'e', deadExchange, 'q', deadQueue],
    { routing_key: deadKey, arguments: {} }, 'Vincular cola de descarte');
  await call('PUT', ['queues', vhost, queue], {
    ...durableQueue,
    arguments: shared ? { 'x-dead-letter-exchange': deadExchange, 'x-dead-letter-routing-key': deadKey } : {},
  }, 'Declarar cola G1');
  if (!shared) {
    await call('PUT', ['policies', vhost, 'g1-marketplace-usuarios-dlx'], {
      pattern: '^marketplace\\.usuarios$', 'apply-to': 'queues', priority: 10,
      definition: { 'dead-letter-exchange': deadExchange, 'dead-letter-routing-key': deadKey },
    }, 'Configurar política de descarte');
  }
  await call('POST', ['bindings', vhost, 'e', exchange, 'q', queue],
    { routing_key: 'usuario.*', arguments: {} }, 'Vincular cola G1');
}

export async function publishTestEvent({ call, vhost }, type = 'usuario.creado') {
  const makeData = eventData.get(type);
  if (!makeData) throw new BrokerError('Tipo de evento de prueba no admitido.');
  const event = {
    eventoId: randomUUID(), tipo: type, version: 1, fecha: new Date().toISOString(),
    usuarioId: randomUUID(), datos: makeData(),
  };
  const result = await call('POST', ['exchanges', vhost, exchange, 'publish'], {
    properties: { content_type: 'application/json', delivery_mode: 2, message_id: event.eventoId },
    routing_key: event.tipo, payload: JSON.stringify(event), payload_encoding: 'string',
  }, 'Publicar evento de prueba', true);
  if (result?.routed !== true) throw new BrokerError('Broker sin ruta confirmada para el evento de prueba.');
  return { modo: 'MOCK', eventoId: event.eventoId, tipo: event.tipo, routed: true };
}

export async function peekQueues({ call, vhost }, count = 5) {
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new BrokerError('El número de mensajes por cola debe estar entre 1 y 10.');
  }
  const summaries = [];
  for (const name of [queue, deadQueue]) {
    const messages = await call('POST', ['queues', vhost, name, 'get'],
      { count, ackmode: 'ack_requeue_true', encoding: 'auto', truncate: 4096 }, 'Leer cola de pruebas', true);
    if (!Array.isArray(messages)) throw new BrokerError('Respuesta de cola inesperada.');
    summaries.push({
      cola: name,
      mensajes: messages.map((message) => {
        let event;
        if (message?.payload_encoding === 'string' && typeof message.payload === 'string') {
          try { event = JSON.parse(message.payload); } catch { /* Contenido no verificable. */ }
        }
        if (!uuid.test(event?.eventoId ?? '') || !knownEvents.has(event?.tipo) ||
            !Number.isSafeInteger(event?.version) || event.version < 1) {
          return { resumen: 'omitido: sobre no reconocido o truncado' };
        }
        return { eventoId: event.eventoId, tipo: event.tipo, version: event.version };
      }),
    });
  }
  return summaries;
}

export async function runCli(action) {
  try {
    const output = await action(managementClient(process.env));
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(error instanceof BrokerError ? error.message : 'Error inesperado del kit de RabbitMQ.');
    process.exitCode = 1;
  }
}
