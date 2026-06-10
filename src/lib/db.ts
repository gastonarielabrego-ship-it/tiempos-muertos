import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
};

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db';

  // Turso / libsql URL detected
  if (dbUrl.startsWith('libsql://')) {
    const { createClient } = require('@libsql/client');
    const { PrismaLibSQL } = require('@prisma/adapter-libsql');

    const libsql = createClient({ url: dbUrl, authToken: process.env.DATABASE_AUTH_TOKEN });
    const adapter = new PrismaLibSQL(libsql);

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    }) as PrismaClient;
  }

  // Local SQLite
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;