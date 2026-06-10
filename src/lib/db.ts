import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
};

/**
 * Reads DATABASE_URL at RUNTIME (not build time).
 * Using a function prevents the bundler from inlining the value.
 */
function runtimeDatabaseUrl(): string {
  return process.env.DATABASE_URL || '';
}

function runtimeIsTurso(): boolean {
  return runtimeDatabaseUrl().startsWith('libsql://');
}

let _client: PrismaClient | null = null;
let _initPromise: Promise<PrismaClient> | null = null;

async function getClient(): Promise<PrismaClient> {
  if (_client) return _client;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const url = runtimeDatabaseUrl();
    const isTurso = url.startsWith('libsql://');

    if (isTurso) {
      // With provider = "libsql" in schema, Prisma natively accepts libsql:// URLs.
      // No adapter, no env var manipulation needed.
      _client = new PrismaClient({
        log: [],
      }) as unknown as PrismaClient;
      console.log('[db] Connected to Turso');
    } else {
      // Local SQLite (file: URL)
      _client = new PrismaClient({
        log: [],
      });
      console.log('[db] Connected to local SQLite');
    }

    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _client;

    // Auto-create tables on Turso / fresh deployments
    try {
      await _client.$executeRawUnsafe(`
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
      await _client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScanRecord_codUti_fecha_idx" ON "ScanRecord"("codUti", "fecha")`);
      await _client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScanRecord_fecha_idx" ON "ScanRecord"("fecha")`);
      console.log('[db] Tables ready');
    } catch (e) {
      console.error('[db] Auto-create table error:', e);
    }

    return _client;
  })();

  return _initPromise;
}

// Export a Proxy so existing code works with async init.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (prop === 'then') return undefined;
    if (!_client) {
      throw new Error(
        `[db] Not initialized. Call getClient() first. ` +
        `DATABASE_URL=${runtimeDatabaseUrl() ? runtimeDatabaseUrl().substring(0, 20) + '...' : 'UNDEFINED'}`
      );
    }
    const value = Reflect.get(_client, prop, receiver);
    if (typeof value === 'function') return value.bind(_client);
    return value;
  },
});

export { getClient, runtimeDatabaseUrl, runtimeIsTurso };