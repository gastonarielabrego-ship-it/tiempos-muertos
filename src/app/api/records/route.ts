import { NextResponse } from 'next/server';
import { getClient } from '@/lib/db';

export async function GET() {
  try {
    const db = await getClient();
    // Get all distinct dates
    const dates = await db.scanRecord.findMany({
      distinct: ['fecha'],
      select: { fecha: true },
      orderBy: { fecha: 'desc' },
    });

    const operators = await db.scanRecord.findMany({
      distinct: ['codUti'],
      select: { codUti: true, nomUti: true },
      orderBy: { nomUti: 'asc' },
    });

    const zones = await db.scanRecord.findMany({
      distinct: ['zonSts'],
      select: { zonSts: true },
      where: { zonSts: { not: null } },
      orderBy: { zonSts: 'asc' },
    });

    const activities = await db.scanRecord.findMany({
      distinct: ['codAct'],
      select: { codAct: true },
      orderBy: { codAct: 'asc' },
    });

    const totalRecords = await db.scanRecord.count();

    return NextResponse.json({
      dates: dates.map(d => d.fecha.toISOString().split('T')[0]),
      operators: operators.map(o => ({ codUti: o.codUti, nomUti: o.nomUti })),
      zones: zones.map(z => z.zonSts).filter(Boolean) as string[],
      activities: activities.map(a => a.codAct),
      totalRecords,
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    return NextResponse.json({ error: 'Error al obtener filtros' }, { status: 500 });
  }
}