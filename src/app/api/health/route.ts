import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL || '';
  const directUrl = process.env.DIRECT_URL || '';

  const info = {
    databaseUrl: databaseUrl ? databaseUrl.substring(0, 40) + '...' : 'NOT SET',
    directUrl: directUrl ? directUrl.substring(0, 40) + '...' : 'NOT SET',
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    const recordCount = await db.scanRecord.count();
    return NextResponse.json({ ...info, status: 'connected', recordCount });
  } catch (e: unknown) {
    // Handle ErrorEvent objects from Neon serverless driver
    let msg = 'Unknown error';
    if (e instanceof Error) {
      msg = e.message;
    } else if (e && typeof e === 'object' && 'message' in e) {
      msg = String((e as any).message);
    } else if (e && typeof e === 'object' && 'type' in e) {
      // ErrorEvent from Neon WebSocket
      msg = `ErrorEvent type: ${(e as any).type}, error: ${JSON.stringify((e as any).error || 'none')}`;
    } else {
      msg = String(e);
    }
    console.error('[health] DB error:', msg, e);
    return NextResponse.json({ ...info, status: 'error', error: msg.substring(0, 500) }, { status: 500 });
  }
}
