import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, clearFirst } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    // Clear existing data on first batch
    if (clearFirst) {
      await db.scanRecord.deleteMany({});
    }

    // Insert new records
    const data = rows.map((r: Record<string, unknown>) => ({
      codUti: String(r.codUti || ''),
      nomUti: String(r.nomUti || ''),
      fecha: new Date(String(r.fecha || new Date())),
      hora: String(r.hora || '00:00:00'),
      codAct: Number(r.codAct) || 0,
      zonSts: r.zonSts ? String(r.zonSts) : null,
      allSts: Number(r.allSts) || 0,
      dplSts: Number(r.dplSts) || 0,
      nivSts: Number(r.nivSts) || 0,
      codPro: String(r.codPro || ''),
      pcbPro: Number(r.pcbPro) || 0,
      bultos: Number(r.bultos) || 0,
      createdAt: new Date(),
    }));

    const result = await db.scanRecord.createMany({ data });
    return NextResponse.json({ inserted: result.count });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido';
    console.error('[upload]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
