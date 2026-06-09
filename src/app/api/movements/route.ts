import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';

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

    const grouped = new Map<string, typeof allScans>();
    for (const s of allScans) {
      const key = `${s.codUti}|${s.fecha.toISOString().split('T')[0]}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }

    interface Row {
      id: number;
      codUti: string;
      nomUti: string;
      fecha: string;
      hora: string;
      codAct: number;
      zonSts: string | null;
      allSts: number;
      dplSts: number;
      nivSts: number;
      codPro: string;
      pcbPro: number;
      bultos: number;
      gapSeconds: number | null;
      isDeadTime: boolean;
    }

    const rows: Row[] = [];
    let totalDeadTimeSec = 0;

    for (const [, dayScans] of grouped) {
      for (let i = 0; i < dayScans.length; i++) {
        const curr = dayScans[i];
        let gapSeconds: number | null = null;
        let isDeadTime = false;

        if (i > 0) {
          const prev = dayScans[i - 1];
          const p = prev.hora.split(':').map(Number);
          const c = curr.hora.split(':').map(Number);
          const gap = (c[0] * 3600 + c[1] * 60 + c[2]) - (p[0] * 3600 + p[1] * 60 + p[2]);
          if (gap > 0) {
            gapSeconds = gap;
            isDeadTime = gap > 300;
            if (isDeadTime) totalDeadTimeSec += gap;
          }
        }

        rows.push({
          id: curr.id,
          codUti: curr.codUti,
          nomUti: curr.nomUti,
          fecha: curr.fecha.toISOString().split('T')[0],
          hora: curr.hora,
          codAct: curr.codAct,
          zonSts: curr.zonSts,
          allSts: curr.allSts,
          dplSts: curr.dplSts,
          nivSts: curr.nivSts,
          codPro: curr.codPro,
          pcbPro: curr.pcbPro,
          bultos: curr.bultos,
          gapSeconds,
          isDeadTime,
        });
      }
    }

    const total = rows.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const paginatedRows = rows.slice(start, start + pageSize);
    const deadTimeCount = rows.filter(r => r.isDeadTime).length;

    return NextResponse.json({
      rows: paginatedRows,
      pagination: { page, pageSize, total, totalPages },
      summary: {
        totalDeadTimeSec,
        totalDeadTimeFormatted: formatSec(totalDeadTimeSec),
        deadTimeCount,
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