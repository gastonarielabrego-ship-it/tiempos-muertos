import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const DEAD_TIME_THRESHOLD = 300;

type Turno = 'TM' | 'TT' | 'TN';

function getTurno(hora: string): Turno {
  const parts = hora.split(':').map(Number);
  const totalMin = parts[0] * 60 + parts[1];
  if (totalMin < 6 * 60) return 'TN';
  if (totalMin < 14 * 60) return 'TM';
  if (totalMin < 22 * 60) return 'TT';
  return 'TN';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get('operator') || 'all';
    const turnoFilter = searchParams.get('turno');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');

    const where: Record<string, unknown> = {};
    if (operator !== 'all') where.codUti = operator;

    const allScans = await db.scanRecord.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ codUti: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }],
    });

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

    const grouped = new Map<string, typeof allScans>();
    for (const s of allScans) {
      const fechaStr = s.fecha instanceof Date ? s.fecha.toISOString().split('T')[0] : String(s.fecha).split('T')[0];
      const key = `${s.codUti}|${fechaStr}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }

    const gaps: GapRow[] = [];
    let totalDeadTimeSec = 0;

    for (const [, dayScans] of grouped) {
      const turno: Turno = getTurno(dayScans[0].hora);
      if (turnoFilter && turno !== turnoFilter) continue;

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
            fecha: curr.fecha instanceof Date ? curr.fecha.toISOString().split('T')[0] : String(curr.fecha).split('T')[0],
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