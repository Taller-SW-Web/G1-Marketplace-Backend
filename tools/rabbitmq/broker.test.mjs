import assert from 'node:assert/strict';
import { test } from 'node:test';
import { managementClient, peekQueues, publishTestEvent, setupBroker } from './broker.mjs';

const env = {
  RABBITMQ_MANAGEMENT_URL: 'https://broker.example.invalid/api/',
  RABBITMQ_ADMIN_USER: 'administrador-de-prueba',
  RABBITMQ_ADMIN_PASSWORD: 'valor-mock-administrador',
  RABBITMQ_VHOST: 'h5/pruebas',
  RABBITMQ_G7_PUBLISHER_PASSWORD: 'valor-mock-g7',
  RABBITMQ_G1_CONSUMER_PASSWORD: 'valor-mock-g1',
};

function fake(reply = () => new Response(null, { status: 204 }), settings = env) {
  const calls = [];
  const client = managementClient(settings, async (url, opts) => {
    calls.push({ path: new URL(url).pathname, method: opts.method, body: JSON.parse(opts.body) });
    assert.equal(opts.redirect, 'error');
    assert.equal(opts.headers.Authorization,
      'Basic ' + Buffer.from(settings.RABBITMQ_ADMIN_USER + ':' + settings.RABBITMQ_ADMIN_PASSWORD).toString('base64'));
    return reply();
  });
  return { calls, client };
}

test('MOCK · setup declara los mismos recursos y bindings al repetir', async () => {
  const { calls, client } = fake();
  await setupBroker(client, env);
  await setupBroker(client, env);
  const count = calls.length / 2;
  assert.equal(count, 10);
  assert.deepEqual(calls.slice(0, count), calls.slice(count));
  const vhost = 'h5%2Fpruebas';
  const at = (path) => calls.find((call) => call.path === '/api/' + path);
  assert.deepEqual(at('users/g7_publicador').body, { password: env.RABBITMQ_G7_PUBLISHER_PASSWORD, tags: '' });
  assert.deepEqual(at('users/g1_consumidor').body, { password: env.RABBITMQ_G1_CONSUMER_PASSWORD, tags: '' });
  assert.deepEqual(at('permissions/' + vhost + '/g7_publicador').body,
    { configure: '^$', write: '^seguridad\\.usuarios$', read: '^$' });
  assert.deepEqual(at('permissions/' + vhost + '/g1_consumidor').body,
    {
      configure: '^(?:seguridad\\.usuarios|marketplace\\.usuarios|marketplace\\.usuarios\\.retry\\.(?:[1-9]|10)\\.usuario_(?:creado|desactivado|reactivado|bloqueado|desbloqueado|roles_cambiados|atributos_actualizados))$',
      write: '^marketplace\\.usuarios\\.retry\\.(?:[1-9]|10)\\.usuario_(?:creado|desactivado|reactivado|bloqueado|desbloqueado|roles_cambiados|atributos_actualizados)$',
      read: '^(?:marketplace\\.usuarios|seguridad\\.usuarios)$',
    });
  assert.equal(at('exchanges/' + vhost + '/seguridad.usuarios').body.type, 'topic');
  assert.deepEqual(at('queues/' + vhost + '/marketplace.usuarios').body, {
    durable: true,
    auto_delete: false,
    arguments: {
      'x-dead-letter-exchange': 'seguridad.usuarios.dlx',
      'x-dead-letter-routing-key': 'descartado',
    },
  });
  assert.equal(at('exchanges/' + vhost + '/seguridad.usuarios.dlx').body.type, 'direct');
  assert.equal(at('queues/' + vhost + '/seguridad.usuarios.dlq').body.durable, true);
  assert.equal(at('bindings/' + vhost + '/e/seguridad.usuarios.dlx/q/seguridad.usuarios.dlq').body.routing_key, 'descartado');
  const binding = at('bindings/' + vhost + '/e/seguridad.usuarios/q/marketplace.usuarios');
  assert.equal(binding.method, 'POST');
  assert.equal(binding.body.routing_key, 'usuario.*');
});

test('MOCK · arma los tres eventos con el sobre de G7 y UUID nuevos', async () => {
  const { calls, client } = fake(() => Response.json({ routed: true }));
  const id = /^[0-9a-f-]{36}$/i;
  const prior = new Set();
  for (const [tipo, datos] of [
    ['usuario.creado', { roles: ['CLIENTE'] }],
    ['usuario.bloqueado', { automatico: false, hasta: null }],
    ['usuario.roles_cambiados', { roles: ['VENDEDOR', 'GESTOR_COMERCIAL'] }],
  ]) {
    const out = await publishTestEvent(client, tipo);
    const { method, path, body } = calls.at(-1);
    assert.equal(method, 'POST');
    assert.equal(path, '/api/exchanges/h5%2Fpruebas/seguridad.usuarios/publish');
    assert.equal(body.routing_key, tipo);
    assert.equal(body.payload_encoding, 'string');
    assert.equal(body.properties.delivery_mode, 2);
    const event = JSON.parse(body.payload);
    assert.deepEqual(Object.keys(event), ['eventoId', 'tipo', 'version', 'fecha', 'usuarioId', 'datos']);
    assert.equal(body.properties.message_id, event.eventoId);
    assert.equal(out.modo, 'MOCK');
    assert.match(event.eventoId, id);
    assert.match(event.usuarioId, id);
    assert.equal(event.tipo, tipo);
    assert.equal(event.version, 1);
    assert.equal(new Date(event.fecha).toISOString(), event.fecha);
    assert.deepEqual(event.datos, datos);
    assert.equal(prior.has(event.eventoId), false);
    prior.add(event.eventoId);
  }
  const unrouted = fake(() => Response.json({ routed: false }));
  await assert.rejects(publishTestEvent(unrouted.client), /sin ruta confirmada/);
});

test('MOCK · inspecciona las dos colas con reencolado y sin volcar cuerpos', async () => {
  const eventoId = '11111111-1111-4111-8111-111111111111';
  const { calls, client } = fake(() => Response.json([
    { payload_encoding: 'string', payload: JSON.stringify({
      eventoId, tipo: 'usuario.creado', version: 1, datos: { valor: 'no-imprimir' },
    }) },
    { payload_encoding: 'string', payload: 'no-imprimir tampoco' },
  ]));
  const out = await peekQueues(client, 2);
  assert.deepEqual(out.map(({ modo }) => modo), ['MOCK', 'MOCK']);
  assert.deepEqual(calls.map((call) => call.path), [
    '/api/queues/h5%2Fpruebas/marketplace.usuarios/get',
    '/api/queues/h5%2Fpruebas/seguridad.usuarios.dlq/get',
  ]);
  for (const call of calls) {
    assert.equal(call.method, 'POST');
    assert.deepEqual(call.body, { count: 2, ackmode: 'ack_requeue_true', encoding: 'auto', truncate: 4096 });
  }
  assert.deepEqual(out[0].mensajes[0], { eventoId, tipo: 'usuario.creado', version: 1 });
  assert.ok(!JSON.stringify(out).includes('no-imprimir'));
});

test('MOCK · permisos rechazados detienen el setup y no propagan el cuerpo', async () => {
  const { calls, client } = fake(() => new Response('contenido no publicable', { status: 403 }));
  await assert.rejects(setupBroker(client, env), (error) => error.message === 'Crear usuario G7: HTTP 403.');
  assert.equal(calls.length, 1);
  assert.throws(() => managementClient({ ...env, RABBITMQ_MANAGEMENT_URL: 'http://broker.example.invalid/' }), /HTTPS/);
});

test('MOCK · un usuario usa el vhost existente y repite solo la topología', async () => {
  const sharedEnv = {
    RABBITMQ_MANAGEMENT_URL: env.RABBITMQ_MANAGEMENT_URL,
    RABBITMQ_ADMIN_USER: env.RABBITMQ_ADMIN_USER,
    RABBITMQ_ADMIN_PASSWORD: env.RABBITMQ_ADMIN_PASSWORD,
    RABBITMQ_VHOST: 'h5/pruebas +%?',
    RABBITMQ_MODO: 'un-usuario',
  };
  const { calls, client } = fake(undefined, sharedEnv);
  await setupBroker(client, sharedEnv);
  await setupBroker(client, sharedEnv);

  const path = 'h5%2Fpruebas%20%2B%25%3F';
  assert.deepEqual(calls.slice(0, 6), calls.slice(6));
  assert.deepEqual(calls.slice(0, 6).map(({ method, path }) => [method, path]), [
    ['PUT', '/api/exchanges/' + path + '/seguridad.usuarios'],
    ['PUT', '/api/exchanges/' + path + '/seguridad.usuarios.dlx'],
    ['PUT', '/api/queues/' + path + '/seguridad.usuarios.dlq'],
    ['POST', '/api/bindings/' + path + '/e/seguridad.usuarios.dlx/q/seguridad.usuarios.dlq'],
    ['PUT', '/api/queues/' + path + '/marketplace.usuarios'],
    ['POST', '/api/bindings/' + path + '/e/seguridad.usuarios/q/marketplace.usuarios'],
  ]);
  assert.equal(calls[0].body.type, 'topic');
  assert.equal(calls[0].body.durable, true);
  assert.equal(calls[2].body.durable, true);
  assert.deepEqual(calls[4].body, {
    durable: true, auto_delete: false, arguments: {
      'x-dead-letter-exchange': 'seguridad.usuarios.dlx',
      'x-dead-letter-routing-key': 'descartado',
    },
  });
  assert.deepEqual(calls[3].body, { routing_key: 'descartado', arguments: {} });
  assert.deepEqual(calls[5].body, { routing_key: 'usuario.*', arguments: {} });
});

test('MOCK · publicación y lectura reutilizan la cuenta de management de un usuario', async () => {
  const sharedEnv = { ...env, RABBITMQ_MODO: 'un-usuario' };
  delete sharedEnv.RABBITMQ_G7_PUBLISHER_PASSWORD;
  delete sharedEnv.RABBITMQ_G1_CONSUMER_PASSWORD;
  const replies = [{ routed: true }, [], []];
  const { calls, client } = fake(() => Response.json(replies.shift()), sharedEnv);
  assert.equal((await publishTestEvent(client)).routed, true);
  assert.equal((await peekQueues(client)).length, 2);
  assert.deepEqual(calls.map(({ path }) => path), [
    '/api/exchanges/h5%2Fpruebas/seguridad.usuarios/publish',
    '/api/queues/h5%2Fpruebas/marketplace.usuarios/get',
    '/api/queues/h5%2Fpruebas/seguridad.usuarios.dlq/get',
  ]);
  assert.ok(calls.slice(1).every(({ body }) => body.ackmode === 'ack_requeue_true'));
});

test('MOCK · modo inválido se rechaza antes de hacer peticiones', async () => {
  const { client, calls } = fake();
  await assert.rejects(setupBroker(client, { ...env, RABBITMQ_MODO: 'unusuario' }), /RABBITMQ_MODO/);
  assert.equal(calls.length, 0);
});

test('clasifica por destino y por transporte sin abrir conexiones', () => {
  assert.equal(managementClient(env).modo, 'REAL');
  for (const url of ['http://localhost:15672', 'https://127.0.0.2:15671', 'https://[::1]:15671']) {
    assert.equal(managementClient({ ...env, RABBITMQ_MANAGEMENT_URL: url }).modo, 'MOCK');
  }
  assert.equal(fake().client.modo, 'MOCK');
});

test('publicación y ambas colas conservan la etiqueta REAL de un destino HTTPS', async () => {
  const replies = [{ routed: true }, [], []];
  // Construir la configuración de red y sustituir las llamadas antes de ejecutarlas.
  const client = { ...managementClient(env), call: async () => replies.shift() };
  assert.equal((await publishTestEvent(client)).modo, 'REAL');
  assert.deepEqual((await peekQueues(client)).map(({ modo }) => modo), ['REAL', 'REAL']);
});
