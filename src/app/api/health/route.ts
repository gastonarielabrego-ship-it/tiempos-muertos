import { NextResponse } from 'next/server';
import { runtimeDatabaseUrl, runtimeIsTurso, getClient } from '@/lib/db';

export async function GET() {
  const url = runtimeDatabaseUrl();
  const isTurso = runtimeIsTurso();
  const hasAuthToken = !!(process.env.DATABASE_AUTH_TOKEN || process.env.TOKEN_AUTH_DE_BASE_DE_DATOS);

  const info = {
    databaseUrl: url ? `${url.substring(0, 25)}...` : 'UNDEFINED',
    isTurso,
    hasAuthToken,
    nodeEnv: process.env.NODE_ENV,
  };

  // Try actual connection
  if (url) {
    try {
      const db = await getClient();
      const count = await db.scanRecord.count();
      return NextResponse.json({ ...info, status: 'connected', recordCount: count });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ...info, status: 'error', error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ ...info, status: 'no_database_url' }, { status: 500 });
}