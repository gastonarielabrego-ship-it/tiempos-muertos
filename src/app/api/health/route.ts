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
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ...info, status: 'error', error: msg.substring(0, 300) }, { status: 500 });
  }
}
