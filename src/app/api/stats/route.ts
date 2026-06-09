import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get('operator');
    const zone = searchParams.get('zone');
    const activity = searchParams.get('activity');

    // Build where clause
    const where: Prisma.ScanRecordWhereInput = {};
    if (operator) where.codUti = operator;
    if (zone) where.zonSts = zone;
    if (activity) where.codAct = parseInt(activity);

    // 1. Get all scans ordered by operator and time
    const scans = await db.scanRecord.findMany({
      where,
      orderBy: [{ codUti: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }],
    });

    if (scans.length === 0) {
      return NextResponse.json({
        kpis: { totalScans: 0, totalDeadTime: 0, avgDeadTime: 0, maxDeadTime: 0, operatorsCount: 0 },
        byOperator: [],
        byRange: [],
        byHour: [],
        byZone: [],
        byActivity: [],
        topGaps: [],
      });
    }

    // 2. Calculate dead times (gaps between consecutive scans per operator per day)
    interface DeadTimeRecord {
      codUti: string;
      nomUti: string;
      fecha: Date;
      hora: string;
      prevHora: string;
      gapSeconds: number;
      zonSts: string | null;
      codAct: number;
    }

    const deadTimes: DeadTimeRecord[] = [];
    let totalDeadTime = 0;
    let maxDeadTime = 0;

    // Group by operator
    const groupedByOp = new Map<string, typeof scans>();
    for (const scan of scans) {
      const key = scan.codUti;
      if (!groupedByOp.has(key)) groupedByOp.set(key, []);
      groupedByOp.get(key)!.push(scan);
    }

    for (const [, opScans] of groupedByOp) {
      // Group by date
      const byDate = new Map<string, typeof opScans>();
      for (const scan of opScans) {
        const dateKey = scan.fecha.toISOString().split('T')[0];
        if (!byDate.has(dateKey)) byDate.set(dateKey, []);
        byDate.get(dateKey)!.push(scan);
      }

      for (const [, dateScans] of byDate) {
        for (let i = 1; i < dateScans.length; i++) {
          const prev = dateScans[i - 1];
          const curr = dateScans[i];
          const prevParts = prev.hora.split(':').map(Number);
          const currParts = curr.hora.split(':').map(Number);
          const prevSec = prevParts[0] * 3600 + prevParts[1] * 60 + prevParts[2];
          const currSec = currParts[0] * 3600 + currParts[1] * 60 + currParts[2];
          const gap = currSec - prevSec;

          if (gap > 0) {
            deadTimes.push({
              codUti: curr.codUti,
              nomUti: curr.nomUti,
              fecha: curr.fecha,
              hora: curr.hora,
              prevHora: prev.hora,
              gapSeconds: gap,
              zonSts: curr.zonSts,
              codAct: curr.codAct,
            });
            totalDeadTime += gap;
            if (gap > maxDeadTime) maxDeadTime = gap;
          }
        }
      }
    }

    const avgDeadTime = deadTimes.length > 0 ? totalDeadTime / deadTimes.length : 0;

    // 3. KPIs
    const kpis = {
      totalScans: scans.length,
      totalDeadTime: Math.round(totalDeadTime),
      avgDeadTime: Math.round(avgDeadTime * 10) / 10,
      maxDeadTime: Math.round(maxDeadTime),
      operatorsCount: groupedByOp.size,
    };

    // 4. By operator (top 20 by total dead time)
    const opMap = new Map<string, { totalSec: number; count: number; maxSec: number; name: string }>();
    for (const dt of deadTimes) {
      if (!opMap.has(dt.codUti)) {
        opMap.set(dt.codUti, { totalSec: 0, count: 0, maxSec: 0, name: dt.nomUti });
      }
      const entry = opMap.get(dt.codUti)!;
      entry.totalSec += dt.gapSeconds;
      entry.count += 1;
      if (dt.gapSeconds > entry.maxSec) entry.maxSec = dt.gapSeconds;
    }
    const byOperator = Array.from(opMap.entries())
      .map(([cod, data]) => ({
        codUti: cod,
        nomUti: data.name,
        totalMin: Math.round((data.totalSec / 60) * 100) / 100,
        avgSec: Math.round((data.totalSec / data.count) * 10) / 10,
        maxSec: data.maxSec,
        gaps: data.count,
      }))
      .sort((a, b) => b.totalMin - a.totalMin)
      .slice(0, 20);

    // 5. By range distribution
    const ranges = [
      { label: '0-30s', min: 0, max: 30, count: 0 },
      { label: '30s-1m', min: 30, max: 60, count: 0 },
      { label: '1-2m', min: 60, max: 120, count: 0 },
      { label: '2-5m', min: 120, max: 300, count: 0 },
      { label: '5-10m', min: 300, max: 600, count: 0 },
      { label: '10-30m', min: 600, max: 1800, count: 0 },
      { label: '30m-1h', min: 1800, max: 3600, count: 0 },
      { label: '>1h', min: 3600, max: Infinity, count: 0 },
    ];
    for (const dt of deadTimes) {
      for (const r of ranges) {
        if (dt.gapSeconds >= r.min && dt.gapSeconds < r.max) {
          r.count++;
          break;
        }
      }
    }
    const byRange = ranges.map(r => ({
      ...r,
      pct: deadTimes.length > 0 ? Math.round((r.count / deadTimes.length) * 1000) / 10 : 0,
    }));

    // 6. By hour (average dead time per hour)
    const hourMap = new Map<number, { totalSec: number; count: number }>();
    for (const dt of deadTimes) {
      const hour = parseInt(dt.hora.split(':')[0]);
      if (!hourMap.has(hour)) hourMap.set(hour, { totalSec: 0, count: 0 });
      const entry = hourMap.get(hour)!;
      entry.totalSec += dt.gapSeconds;
      entry.count += 1;
    }
    const byHour = Array.from(hourMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, data]) => ({
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        avgSec: Math.round((data.totalSec / data.count) * 10) / 10,
        count: data.count,
        totalMin: Math.round((data.totalSec / 60) * 10) / 10,
      }));

    // 7. By zone
    const zoneMap = new Map<string, { totalSec: number; count: number }>();
    for (const dt of deadTimes) {
      const z = dt.zonSts || 'N/A';
      if (!zoneMap.has(z)) zoneMap.set(z, { totalSec: 0, count: 0 });
      const entry = zoneMap.get(z)!;
      entry.totalSec += dt.gapSeconds;
      entry.count += 1;
    }
    const byZone = Array.from(zoneMap.entries())
      .map(([zone, data]) => ({
        zone,
        totalMin: Math.round((data.totalSec / 60) * 10) / 10,
        avgSec: Math.round((data.totalSec / data.count) * 10) / 10,
        count: data.count,
      }))
      .sort((a, b) => b.totalMin - a.totalMin);

    // 8. By activity
    const actMap = new Map<number, { totalSec: number; count: number }>();
    for (const dt of deadTimes) {
      if (!actMap.has(dt.codAct)) actMap.set(dt.codAct, { totalSec: 0, count: 0 });
      const entry = actMap.get(dt.codAct)!;
      entry.totalSec += dt.gapSeconds;
      entry.count += 1;
    }
    const byActivity = Array.from(actMap.entries())
      .map(([act, data]) => ({
        activity: act,
        totalMin: Math.round((data.totalSec / 60) * 10) / 10,
        avgSec: Math.round((data.totalSec / data.count) * 10) / 10,
        count: data.count,
      }))
      .sort((a, b) => b.totalMin - a.totalMin);

    // 9. Top gaps (biggest dead times)
    const topGaps = deadTimes
      .sort((a, b) => b.gapSeconds - a.gapSeconds)
      .slice(0, 50)
      .map(dt => ({
        nomUti: dt.nomUti,
        codUti: dt.codUti,
        fecha: dt.fecha.toISOString().split('T')[0],
        prevHora: dt.prevHora,
        hora: dt.hora,
        gapSeconds: dt.gapSeconds,
        gapFormatted: formatDuration(dt.gapSeconds),
        zona: dt.zonSts,
      }));

    return NextResponse.json({
      kpis,
      byOperator,
      byRange,
      byHour,
      byZone,
      byActivity,
      topGaps,
    });
  } catch (error) {
    console.error('Error calculating stats:', error);
    return NextResponse.json({ error: 'Error al calcular estadísticas' }, { status: 500 });
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}