import { NextResponse } from 'next/server';
import { getTursoUrl, isTurso, getClient } from '@/lib/db';

export async function GET() {
  const tursoUrl = getTursoUrl();
  const useTurso = isTurso();
  const hasAuthToken = !!(process.env.DATABASE_AUTH_TOKEN || process.env.TOKEN_AUTH_DE_BASE_DE_DATOS);
  const dummyUrl = process.env.DATABASE_URL || '';

  const info = {
    tursoUrl: tursoUrl ? `${tursoUrl.substring(0, 35)}...` : 'NOT SET',
    databaseUrl: `${dummyUrl.substring(0, 20)}...`,
    isTurso: useTurso,
    hasAuthToken,
    nodeEnv: process.env.NODE_ENV,
  };

  if (tursoUrl) {
    try {
      const db = await getClient();
      const count = await db.scanRecord.count();
      return NextResponse.json({ ...info, status: 'connected', recordCount: count });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ...info, status: 'error', error: msg.substring(0, 300) }, { status: 500 });
    }
  }

  return NextResponse.json({ ...info, status: 'no_turso_url' }, { status: 500 });
}