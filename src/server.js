const http = require("node:http");
const { createApp } = require("./app");

// Catalog reads do not depend on Marketplace's database or copy G6 catalog data.
let prisma;
async function healthCheck() {
  if (!prisma) {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient();
  }
  await prisma.$queryRaw`SELECT 1`;
}

const server = http.createServer(createApp({ healthCheck }));
const port = Number(process.env.PORT || 10000);
server.listen(port, process.env.HOST || "0.0.0.0", () =>
  console.info(`Marketplace BFF listening on port ${port}`),
);

async function shutdown() {
  server.close(async () => {
    await prisma?.$disconnect();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
