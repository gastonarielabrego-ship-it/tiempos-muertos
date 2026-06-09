import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

const DEAD_TIME_THRESHOLD = 300; // 5 minutos

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get('operator');

    const where: Prisma.ScanRecordWhereInput = {};
    if (operator) where.codUti = operator;

    const scans = await db.scanRecord.findMany({
      where,
      orderBy: [{ codUti: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }],
    });

    if (scans.length === 0) {
      return NextResponse.json({
        kpis: { totalScans: 0, totalDeadTime: 0, deadTimeEvents: 0, avgGap: 0, maxGap: 0 },
        byOperator: [],
      });
    }

    // Group by operator + date
    const grouped = new Map<string, typeof scans>();
    for (const s of scans) {
      const key = `${s.codUti}|${s.fecha.toISOString().split('T')[0]}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }

    let totalDeadTime = 0;
    let deadTimeEvents = 0;
    let maxGap = 0;
    let totalGapSum = 0;
    let totalGapCount = 0;

    const opMap = new Map<string, { name: string; deadSec: number; events: number; maxSec: number }>();

    for (const [, dayScans] of grouped) {
      for (let i = 1; i < dayScans.length; i++) {
        const prev = dayScans[i - 1];
        const curr = dayScans[i];
        const p = prev.hora.split(':').map(Number);
        const c = curr.hora.split(':').map(Number);
        const gap = (c[0] * 3600 + c[1] * 60 + c[2]) - (p[0] * 3600 + p[1] * 60 + p[2]);

        if (gap > 0) {
          totalGapSum += gap;
          totalGapCount++;
          if (gap > maxGap) maxGap = gap;

          if (gap > DEAD_TIME_THRESHOLD) {
            totalDeadTime += gap;
            deadTimeEvents++;
            if (!opMap.has(curr.codUti)) {
              opMap.set(curr.codUti, { name: curr.nomUti, deadSec: 0, events: 0, maxSec: 0 });
            }
            const entry = opMap.get(curr.codUti)!;
            entry.deadSec += gap;
            entry.events++;
            if (gap > entry.maxSec) entry.maxSec = gap;
          }
        }
      }
    }

    const byOperator = Array.from(opMap.entries())
      .map(([cod, d]) => ({
        codUti: cod,
        nomUti: d.name,
        totalMin: Math.round((d.deadSec / 60) * 10) / 10,
        events: d.events,
        maxGap: d.maxSec,
      }))
      .sort((a, b) => b.totalMin - a.totalMin);

    return NextResponse.json({
      kpis: {
        totalScans: scans.length,
        totalDeadTime: Math.round(totalDeadTime),
        deadTimeEvents,
        avgGap: totalGapCount > 0 ? Math.round((totalGapSum / totalGapCount) * 10) / 10 : 0,
        maxGap: Math.round(maxGap),
      },
      byOperator,
    });
  } catch (error) {
    console.error('Error calculating stats:', error);
    return NextResponse.json({ error: 'Error al calcular estadísticas' }, { status: 500 });
  }
}