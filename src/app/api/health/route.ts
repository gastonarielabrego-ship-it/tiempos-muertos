import { NextResponse } from 'next/server';

export async function GET() {
  const tursoUrl = process.env.TURSO_DATABASE_URL || '';
  const hasToken = !!(process.env.DATABASE_AUTH_TOKEN || process.env.TOKEN_AUTH_DE_BASE_DE_DATOS);
  const isTurso = tursoUrl.startsWith('libsql://');

  const info = {
    tursoUrl: tursoUrl ? tursoUrl.substring(0, 40) + '...' : 'NOT SET',
    isTurso,
    hasToken,
    nodeEnv: process.env.NODE_ENV,
  };

  if (isTurso && hasToken) {
    try {
      const { createClient } = await import('@libsql/client');
      const client = createClient({
        url: tursoUrl,
        authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TOKEN_AUTH_DE_BASE_DE_DATOS,
      });
      const result = await client.execute('SELECT COUNT(*) as c FROM "ScanRecord"');
      return NextResponse.json({ ...info, status: 'connected', recordCount: Number(result.rows[0].c) });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ...info, status: 'error', error: msg.substring(0, 300) }, { status: 500 });
    }
  }

  return NextResponse.json({ ...info, status: 'missing_config' }, { status: 500 });
}