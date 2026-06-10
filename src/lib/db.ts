import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
};

const TURSO_URL = process.env.DATABASE_URL || '';
const isTurso = TURSO_URL.startsWith('libsql://');

// Prisma validates DATABASE_URL at construction time.
// When using adapter, provide a dummy file: URL to pass validation.
if (isTurso) {
  process.env.DATABASE_URL = 'file:./dummy.db';
}

let db: PrismaClient;

if (isTurso) {
  // Dynamic import for Turso adapter (avoids bundling issues on Vercel)
  const { createClient } = await import('@libsql/client');
  const { PrismaLibSQL } = await import('@prisma/adapter-libsql');

  const libsql = createClient({
    url: TURSO_URL,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const adapter = new PrismaLibSQL(libsql);

  db = new PrismaClient({
    adapter,
    log: [],
  }) as unknown as PrismaClient;
} else {
  // Local SQLite
  process.env.DATABASE_URL = TURSO_URL || 'file:./db/custom.db';
  db = new PrismaClient({
    log: [],
  });
}

// Singleton in development to survive HMR
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

export { db };

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
      console.log('✅ Turso tables ready');
    } catch (e) {
      console.error('Auto-create table error:', e);
    }
  })();
}