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
    const operator = searchParams.get('operator') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');

    const where: Prisma.ScanRecordWhereInput = {};
    if (operator !== 'all') where.codUti = operator;

    const allScans = await db.scanRecord.findMany({
      where,
      orderBy: [{ codUti: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }],
      select: {
        id: true, codUti: true, nomUti: true, fecha: true, hora: true,
        codAct: true, zonSts: true, allSts: true, dplSts: true, nivSts: true,
        codPro: true, pcbPro: true, bultos: true,
      },
    });

    // Group by operator + date
    const grouped = new Map<string, typeof allScans>();
    for (const s of allScans) {
      const key = `${s.codUti}|${s.fecha.toISOString().split('T')[0]}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }

    interface GapRow {
      rank: number;
      codUti: string;
      nomUti: string;
      fecha: string;
      gapSeconds: number;
      turno: Turno;
      prevHora: string;
      prevZonSts: string | null;
      prevCodAct: number;
      prevCodPro: string;
      prevBultos: number;
      currHora: string;
      currZonSts: string | null;
      currCodAct: number;
      currCodPro: string;
      currBultos: number;
    }

    const gaps: GapRow[] = [];
    let totalDeadTimeSec = 0;

    for (const [, dayScans] of grouped) {
      // Determine shift from first scan of the day
      const turno: Turno = getTurno(dayScans[0].hora);

      for (let i = 1; i < dayScans.length; i++) {
        const prev = dayScans[i - 1];
        const curr = dayScans[i];
        const p = prev.hora.split(':').map(Number);
        const c = curr.hora.split(':').map(Number);
        const gap = (c[0] * 3600 + c[1] * 60 + c[2]) - (p[0] * 3600 + p[1] * 60 + p[2]);

        if (gap > DEAD_TIME_THRESHOLD) {
          totalDeadTimeSec += gap;
          gaps.push({
            rank: 0,
            codUti: curr.codUti,
            nomUti: curr.nomUti,
            fecha: curr.fecha.toISOString().split('T')[0],
            gapSeconds: gap,
            turno,
            prevHora: prev.hora,
            prevZonSts: prev.zonSts,
            prevCodAct: prev.codAct,
            prevCodPro: prev.codPro,
            prevBultos: prev.bultos,
            currHora: curr.hora,
            currZonSts: curr.zonSts,
            currCodAct: curr.codAct,
            currCodPro: curr.codPro,
            currBultos: curr.bultos,
          });
        }
      }
    }

    // Sort by gap descending (ranking)
    gaps.sort((a, b) => b.gapSeconds - a.gapSeconds);
    gaps.forEach((g, i) => { g.rank = i + 1; });

    const total = gaps.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paginatedRows = gaps.slice(start, start + pageSize);

    return NextResponse.json({
      rows: paginatedRows,
      pagination: { page, pageSize, total, totalPages },
      summary: {
        totalDeadTimeSec,
        totalDeadTimeFormatted: formatSec(totalDeadTimeSec),
        deadTimeCount: total,
      },
    });
  } catch (error) {
    console.error('Error fetching movements:', error);
    return NextResponse.json({ error: 'Error al obtener movimientos' }, { status: 500 });
  }
}

function formatSec(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}