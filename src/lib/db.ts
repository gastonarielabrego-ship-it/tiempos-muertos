import { PrismaClient } from '@prisma/client';

// ============================================================
// Unified database interface
// - Production (Turso): @libsql/client directly
// - Local dev: Prisma with SQLite
// ============================================================

const TURSO_URL = process.env.TURSO_DATABASE_URL || '';
const isTurso = TURSO_URL.startsWith('libsql://');

// --- Turso implementation using @libsql/client ---

let _libsql: import('@libsql/client').Client | null = null;

async function getLibsqlClient() {
  if (_libsql) return _libsql;
  const { createClient } = await import('@libsql/client');
  const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TOKEN_AUTH_DE_BASE_DE_DATOS || '';
  _libsql = createClient({ url: TURSO_URL, authToken });
  return _libsql;
}

async function tursoQuery(sql: string, params: (string | number | null)[] = []) {
  const client = await getLibsqlClient();
  return client.execute({ sql, args: params });
}

// --- Prisma implementation for local dev ---

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ log: [] });
  }
  return globalForPrisma.prisma;
}

// --- ScanRecord query interface ---

interface ScanRecordRow {
  id: number;
  codUti: string;
  nomUti: string;
  fecha: Date;
  hora: string;
  codAct: number;
  zonSts: string | null;
  allSts: number;
  dplSts: number;
  nivSts: number;
  codPro: string;
  pcbPro: number;
  bultos: number;
  createdAt: Date;
}

function rowFromTurso(row: Record<string, unknown>): ScanRecordRow {
  return {
    id: Number(row.id),
    codUti: String(row.codUti),
    nomUti: String(row.nomUti),
    fecha: new Date(String(row.fecha)),
    hora: String(row.hora),
    codAct: Number(row.codAct),
    zonSts: row.zonSts ? String(row.zonSts) : null,
    allSts: Number(row.allSts),
    dplSts: Number(row.dplSts),
    nivSts: Number(row.nivSts),
    codPro: String(row.codPro),
    pcbPro: Number(row.pcbPro),
    bultos: Number(row.bultos),
    createdAt: new Date(String(row.createdAt)),
  };
}

// --- Public database interface (same shape as Prisma) ---

export const db = {
  scanRecord: {
    async findMany(args?: {
      distinct?: string[];
      select?: Record<string, boolean>;
      orderBy?: Array<{ [k: string]: string }>;
      where?: Record<string, unknown>;
    }): Promise<ScanRecordRow[]> {
      if (isTurso) {
        const distinct = args?.distinct?.[0];
        const orderBy = args?.orderBy?.[0];
        const orderCol = orderBy ? Object.keys(orderBy)[0] : '"id"';
        const orderDir = orderBy ? (Object.values(orderBy)[0] === 'desc' ? 'DESC' : 'ASC') : 'ASC';

        if (distinct) {
          const sql = `SELECT DISTINCT "${distinct}" as "${distinct}" FROM "ScanRecord" ORDER BY "${distinct}" ${orderDir}`;
          const result = await tursoQuery(sql);
          return result.rows.map(r => ({ [distinct]: r[distinct], fecha: new Date(), hora: '', codUti: '', nomUti: '', codAct: 0, allSts: 0, dplSts: 0, nivSts: 0, codPro: '', pcbPro: 0, bultos: 0, createdAt: new Date() } as unknown as ScanRecordRow));
        }

        let sql = 'SELECT * FROM "ScanRecord"';
        const params: (string | number | null)[] = [];

        if (args?.where?.codUti && args.where.codUti !== 'all') {
          sql += ' WHERE "codUti" = ?';
          params.push(String(args.where.codUti));
        }

        sql += ` ORDER BY ${orderCol} ${orderDir}`;

        const result = await tursoQuery(sql, params);
        return result.rows.map(rowFromTurso);
      }

      // Local Prisma
      const prisma = getPrismaClient();
      return prisma.scanRecord.findMany(args as any) as Promise<ScanRecordRow[]>;
    },

    async count(args?: { where?: Record<string, unknown> }): Promise<number> {
      if (isTurso) {
        const result = await tursoQuery('SELECT COUNT(*) as c FROM "ScanRecord"');
        return Number(result.rows[0].c);
      }
      const prisma = getPrismaClient();
      return prisma.scanRecord.count(args as any);
    },

    async deleteMany(_args?: Record<string, unknown>): Promise<{ count: number }> {
      if (isTurso) {
        await tursoQuery('DELETE FROM "ScanRecord"');
        return { count: -1 };
      }
      const prisma = getPrismaClient();
      return prisma.scanRecord.deleteMany(_args as any);
    },

    async createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }> {
      if (isTurso) {
        const BATCH_SIZE = 500;
        let total = 0;
        for (let i = 0; i < args.data.length; i += BATCH_SIZE) {
          const batch = args.data.slice(i, i + BATCH_SIZE);
          const values = batch.map(r => {
            const fecha = r.fecha instanceof Date ? r.fecha.toISOString() : String(r.fecha);
            const createdAt = r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date().toISOString();
            return `('${r.codUti}','${r.nomUti}','${fecha}','${r.hora}',${r.codAct},${r.zonSts ? `'${r.zonSts}'` : 'NULL'},${r.allSts},${r.dplSts},${r.nivSts},${r.codPro},${r.pcbPro},${r.bultos},'${createdAt}')`;
          }).join(',');
          await tursoQuery(
            `INSERT INTO "ScanRecord" ("codUti","nomUti","fecha","hora","codAct","zonSts","allSts","dplSts","nivSts","codPro","pcbPro","bultos","createdAt") VALUES ${values}`
          );
          total += batch.length;
        }
        return { count: total };
      }
      const prisma = getPrismaClient();
      return prisma.scanRecord.createMany(args as any);
    },
  },

  async $executeRawUnsafe(sql: string) {
    if (isTurso) {
      return tursoQuery(sql);
    }
    const prisma = getPrismaClient();
    return prisma.$executeRawUnsafe(sql);
  },
};

// --- Auto-create tables on Turso ---
async function ensureTables() {
  if (!isTurso) return;
  try {
    await tursoQuery(`
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
    await tursoQuery(`CREATE INDEX IF NOT EXISTS "ScanRecord_codUti_fecha_idx" ON "ScanRecord"("codUti", "fecha")`);
    await tursoQuery(`CREATE INDEX IF NOT EXISTS "ScanRecord_fecha_idx" ON "ScanRecord"("fecha")`);
    console.log('[db] Turso tables ready');
  } catch (e) {
    console.error('[db] Auto-create table error:', e);
  }
}

// Init on first import
ensureTables();

export { isTurso, getLibsqlClient };
export type { ScanRecordRow };