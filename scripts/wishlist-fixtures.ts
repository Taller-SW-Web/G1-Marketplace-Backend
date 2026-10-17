import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';
import { validateTestDatabase } from './test-database';

async function main() {
  const url = validateTestDatabase(process.env);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const products = ['PRD-1', 'PRD-VARIANT', 'PRD-OUT-OF-STOCK', 'PRD-RETIRED', 'PRD-COMMERCE-UNAVAILABLE'];
  if (process.argv.includes('--outage')) products.push('PRD-UNAVAILABLE');
  try {
    for (const customerId of Object.values(SANDBOX_CUSTOMERS)) {
      for (const productId of products) {
        await prisma.wishlistItem.upsert({ where: { customerId_productId: { customerId, productId } },
          create: { customerId, productId }, update: {} });
      }
    }
    console.log('Fixtures A/B preparados solo en marketplace_h3_test; sin borrar datos ni emitir tokens.');
  } finally { await prisma.$disconnect(); }
}
void main().catch(() => { console.error('No se pudieron preparar fixtures; verifica base temporal y migraciones.'); process.exitCode = 1; });
