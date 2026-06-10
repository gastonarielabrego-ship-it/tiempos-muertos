import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.DATABASE_AUTH_TOKEN || process.env.TOKEN_AUTH_DE_BASE_DE_DATOS;

    const info = {
      tursoUrl: url ? url.substring(0, 40) + '...' : 'UNDEFINED',
      hasAuthToken: !!authToken,
      authTokenPrefix: authToken ? authToken.substring(0, 10) + '...' : 'NONE',
    };

    if (!url) {
      return NextResponse.json({ ...info, error: 'TURSO_DATABASE_URL not set' }, { status: 500 });
    }

    // Test direct libsql connection (no Prisma)
    const { createClient } = await import('@libsql/client');
    const libsql = createClient({ url, authToken });
    const result = await libsql.execute('SELECT 1 as test');

    return NextResponse.json({
      ...info,
      status: 'libsql_connected',
      queryResult: result.rows,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ status: 'error', error: msg.substring(0, 500) }, { status: 500 });
  }
}