import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

const DEAD_TIME_THRESHOLD = 300; // 5 minutos

type Turno = 'TM' | 'TT' | 'TN';

function getTurno(hora: string): Turno {
  const parts = hora.split(':').map(Number);
  const totalMin = parts[0] * 60 + parts[1];
  if (totalMin < 6 * 60) return 'TN';   // antes de 6 AM
  if (totalMin < 10 * 60) return 'TM';  // 6 AM a 10 AM
  if (totalMin < 18 * 60) return 'TT';  // 10 AM a 18 PM
  return 'TN';                           // 18 PM en adelante
}

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
        byShift: { TM: { sec: 0, events: 0 }, TT: { sec: 0, events: 0 }, TN: { sec: 0, events: 0 } },
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
    let deadTimeGapSum = 0;

    // Shift breakdown
    const shiftData: Record<Turno, { sec: number; events: number }> = {
      TM: { sec: 0, events: 0 },
      TT: { sec: 0, events: 0 },
      TN: { sec: 0, events: 0 },
    };

    const opMap = new Map<string, {
      name: string; deadSec: number; events: number; maxSec: number;
      turnos: Record<Turno, number>;
    }>();

    for (const [groupKey, dayScans] of grouped) {
      // Determine shift from first scan of the day
      const firstScan = dayScans[0];
      const turno: Turno = getTurno(firstScan.hora);

      for (let i = 1; i < dayScans.length; i++) {
        const prev = dayScans[i - 1];
        const curr = dayScans[i];
        const p = prev.hora.split(':').map(Number);
        const c = curr.hora.split(':').map(Number);
        const gap = (c[0] * 3600 + c[1] * 60 + c[2]) - (p[0] * 3600 + p[1] * 60 + p[2]);

        if (gap > 0) {
          if (gap > maxGap) maxGap = gap;

          if (gap > DEAD_TIME_THRESHOLD) {
            totalDeadTime += gap;
            deadTimeEvents++;
            deadTimeGapSum += gap;
            shiftData[turno].sec += gap;
            shiftData[turno].events++;

            if (!opMap.has(curr.codUti)) {
              opMap.set(curr.codUti, { name: curr.nomUti, deadSec: 0, events: 0, maxSec: 0, turnos: { TM: 0, TT: 0, TN: 0 } });
            }
            const entry = opMap.get(curr.codUti)!;
            entry.deadSec += gap;
            entry.events++;
            entry.turnos[turno] += gap;
            if (gap > entry.maxSec) entry.maxSec = gap;
          }
        }
      }
    }

    const byOperator = Array.from(opMap.entries())
      .map(([cod, d]) => {
        // Predominant shift = the one with most dead seconds
        const predTurno: Turno = (['TM', 'TT', 'TN'] as Turno[]).sort(
          (a, b) => d.turnos[b] - d.turnos[a]
        )[0];
        return {
          codUti: cod,
          nomUti: d.name,
          totalMin: Math.round((d.deadSec / 60) * 10) / 10,
          events: d.events,
          maxGap: d.maxSec,
          turno: predTurno,
        };
      })
      .sort((a, b) => b.totalMin - a.totalMin);

    return NextResponse.json({
      kpis: {
        totalScans: scans.length,
        totalDeadTime: Math.round(totalDeadTime),
        deadTimeEvents,
        avgGap: deadTimeEvents > 0 ? Math.round(deadTimeGapSum / deadTimeEvents) : 0,
        maxGap: Math.round(maxGap),
      },
      byShift: shiftData,
      byOperator,
    });
  } catch (error) {
    console.error('Error calculating stats:', error);
    return NextResponse.json({ error: 'Error al calcular estadísticas' }, { status: 500 });
  }
}