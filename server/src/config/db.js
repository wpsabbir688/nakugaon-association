import { PrismaClient } from '@prisma/client';

// Single shared Prisma client. The query engine binary is resolved from
// node_modules/@prisma/engines (see scripts/setup-engines.sh, needed on
// networks where Prisma's postinstall download is blocked).
export const prisma = new PrismaClient();

export async function connectDb() {
  await prisma.$connect();
  return prisma;
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
