const http = require('http');
const crypto = require('crypto');
const { prisma, addItemToCart, getCurrentCart } = require('./cart/cartService');

const PORT = process.env.PORT || 10000;

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('JSON Inválido'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Configurar CORS restringido y compatible con cookies
  const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Identificación de sesión anónima (Cookie HttpOnly y SameSite=Lax)
  const cookies = parseCookies(req);
  let sessionHash = cookies['cart_session'];
  let isNewSession = false;

  if (!sessionHash) {
    sessionHash = crypto.randomUUID();
    isNewSession = true;
  }

  if (isNewSession) {
    res.setHeader(
      'Set-Cookie',
      `cart_session=${sessionHash}; Path=/; HttpOnly; SameSite=Lax${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`
    );
  }

  const url = req.url ? req.url.split('?')[0] : '';

  // 1. Healthcheck seguro
  if (url === '/' || url === '/health') {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          {
            status: 'UP',
            service: 'g1-marketplace-backend',
            database: 'connected',
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
    } catch (error) {
      console.error('[Healthcheck Error]:', error.message);
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify(
          {
            status: 'DOWN',
            service: 'g1-marketplace-backend',
            database: 'disconnected',
            timestamp: new Date().toISOString(),
          },
          null,
          2
        )
      );
    }
    return;
  }

  // 2. TASK-F016-BE-001: POST /api/v1/carts/current/items (y alias /api/cart/items)
  if (req.method === 'POST' && (url === '/api/v1/carts/current/items' || url === '/api/cart/items')) {
    try {
      const body = await parseBody(req);
      const result = await addItemToCart({
        sessionHash,
        sku: body.sku,
        quantity: body.quantity,
      });

      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: result.data }));
    } catch (error) {
      const status = error.status || 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: error.code || 'INTERNAL_ERROR',
            message: error.message || 'Error interno al procesar el carrito.',
          },
        })
      );
    }
    return;
  }

  // 3. TASK-F019-BE-001: GET /api/v1/carts/current (y alias /api/cart)
  if (req.method === 'GET' && (url === '/api/v1/carts/current' || url === '/api/cart')) {
    try {
      const cartData = await getCurrentCart({ sessionHash });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: cartData }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: error.message || 'Error al consultar el carrito.',
          },
        })
      );
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }));
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor Marketplace Backend escuchando en http://localhost:${PORT}`);
  console.log(`🩺 Health check disponible en http://localhost:${PORT}/health`);
  console.log(`🛒 Cart endpoints: POST /api/v1/carts/current/items & GET /api/v1/carts/current`);
});
