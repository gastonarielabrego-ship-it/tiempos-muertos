import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
};

// For adapter mode, Prisma needs a valid SQLite URL for validation
// but the actual connection goes through the libsql adapter
const TURSO_URL = process.env.DATABASE_URL || '';
const isTurso = TURSO_URL.startsWith('libsql://');

// Prisma validates DATABASE_URL at construction time.
// When using adapter, we provide a dummy file: URL to pass validation.
if (isTurso) {
  process.env.DATABASE_URL = 'file:./dummy.db';
}

function createPrismaClient() {
  if (isTurso) {
    const { createClient } = require('@libsql/client');
    const { PrismaLibSQL } = require('@prisma/adapter-libsql');

    const libsql = createClient({ url: TURSO_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
    const adapter = new PrismaLibSQL(libsql);

    return new PrismaClient({
      adapter,
      log: [],
    }) as PrismaClient;
  }

  // Local SQLite - restore original URL
  if (!isTurso) {
    process.env.DATABASE_URL = TURSO_URL || 'file:./db/custom.db';
  }
  return new PrismaClient({
    log: [],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

// Auto-create tables on Turso / fresh deployments
if (isTurso) {
  (async () => {
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ScanRecord" (
          "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          "codUti" TEXT NOT NULL,
          "nomUti" TEXT NOT NULL,
          "fecha" DATETIME NOT NULL,
          "hora" TEXT NOT NULL,
          "codAct" INTEGER NOT NULL DEFAULT 0,
          "zonSts" TEXT,
          "allSts" INTEGER NOT NULL DEFAULT 0,
          "dplSts" INTEGER NOT NULL DEFAULT 0,
          "nivSts" INTEGER NOT NULL DEFAULT 0,
          "codPro" TEXT NOT NULL,
          "pcbPro" INTEGER NOT NULL DEFAULT 0,
          "bultos" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScanRecord_codUti_fecha_idx" ON "ScanRecord"("codUti", "fecha")`);
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScanRecord_fecha_idx" ON "ScanRecord"("fecha")`);
    } catch {}
  })();
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;