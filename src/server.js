const http = require('http');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const PORT = process.env.PORT || 10000;

const server = http.createServer(async (req, res) => {
  // Configurar cabeceras CORS con origen concreto
  const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/' || req.url === '/health') {
    try {
      // Verificar conectividad real con la base de datos PostgreSQL
      await prisma.$queryRaw`SELECT 1`;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'UP',
        service: 'g1-marketplace-backend',
        database: 'connected',
        timestamp: new Date().toISOString()
      }, null, 2));
    } catch (error) {
      console.error('[Healthcheck Error]:', error.message);

      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'DOWN',
        service: 'g1-marketplace-backend',
        database: 'disconnected',
        timestamp: new Date().toISOString()
      }, null, 2));
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor Marketplace Backend escuchando en http://localhost:${PORT}`);
  console.log(`🩺 Health check disponible en http://localhost:${PORT}/health`);
});
