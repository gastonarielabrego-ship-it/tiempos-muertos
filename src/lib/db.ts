import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
};

/**
 * Runtime-safe Turso URL check.
 * Reads from TURSO_DATABASE_URL (real connection) or DATABASE_URL (fallback).
 */
function getTursoUrl(): string {
  return process.env.TURSO_DATABASE_URL || '';
}

function isTurso(): boolean {
  return getTursoUrl().startsWith('libsql://');
}

let _client: PrismaClient | null = null;
let _initPromise: Promise<PrismaClient> | null = null;

async function getClient(): Promise<PrismaClient> {
  if (_client) return _client;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const tursoUrl = getTursoUrl();
    const useTurso = tursoUrl.startsWith('libsql://');

    if (useTurso) {
      const { createClient } = await import('@libsql/client');
      const { PrismaLibSQL } = await import('@prisma/adapter-libsql');

      const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TOKEN_AUTH_DE_BASE_DE_DATOS;

      const libsql = createClient({
        url: tursoUrl,
        authToken,
      });
      const adapter = new PrismaLibSQL(libsql);

      // Schema has hardcoded url="file:./dummy.db", adapter handles real connection
      _client = new PrismaClient({ adapter, log: [] }) as unknown as PrismaClient;
      console.log('[db] Connected to Turso');
    } else {
      // Local dev: override schema's dummy URL with real file: URL
      const localUrl = process.env.DATABASE_URL || 'file:./db/custom.db';
      _client = new PrismaClient({
        datasources: { db: { url: localUrl } },
        log: [],
      });
      console.log('[db] Connected to local SQLite');
    }

    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _client;

    // Auto-create tables
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

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (prop === 'then') return undefined;
    if (!_client) {
      throw new Error(
        `[db] Not initialized. Call getClient() first. ` +
        `TURSO_DATABASE_URL=${getTursoUrl() ? getTursoUrl().substring(0, 30) + '...' : 'UNDEFINED'}`
      );
    }
    const value = Reflect.get(_client, prop, receiver);
    if (typeof value === 'function') return value.bind(_client);
    return value;
  },
});

export { getClient, getTursoUrl, isTurso };