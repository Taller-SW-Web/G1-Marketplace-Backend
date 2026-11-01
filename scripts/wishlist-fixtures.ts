import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { SANDBOX_CUSTOMERS } from '../src/identity/sandbox-token';
import { validateTestDatabase } from './test-database';

async function main() {
  if (process.env.H3_ALLOW_TEST_DATABASE_WRITES !== 'true') {
    throw new Error('Fixture writes disabled: explicit authorization for test database writes is required');
  }
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
void main().catch(() => {
  console.error(process.env.H3_ALLOW_TEST_DATABASE_WRITES !== 'true'
    ? 'Fixtures deshabilitados: no se intentó acceder a la base de datos.'
    : 'No se pudieron preparar fixtures; verifica base temporal y migraciones.');
  process.exitCode = 1;
});
