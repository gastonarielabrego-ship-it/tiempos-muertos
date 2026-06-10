import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import { Prisma } from '@prisma/client';

type Turno = 'TM' | 'TT' | 'TN';

function getTurno(hora: string): Turno {
  const parts = hora.split(':').map(Number);
  const totalMin = parts[0] * 60 + parts[1];
  if (totalMin < 6 * 60) return 'TN';
  if (totalMin < 14 * 60) return 'TM';
  if (totalMin < 22 * 60) return 'TT';
  return 'TN';
}

function horaToSec(hora: string): number {
  const p = hora.split(':').map(Number);
  return p[0] * 3600 + p[1] * 60 + p[2];
}

interface PickRow {
  codUti: string;
  nomUti: string;
  fecha: string;
  turno: Turno;
  totalScans: number;
  // Primer pikeo
  primerHora: string;
  primerZona: string | null;
  primerProducto: string;
  // Último pikeo
  ultimoHora: string;
  ultimoZona: string | null;
  ultimoProducto: string;
  // Jornada
  jornadaSec: number;
}

export async function GET(request: NextRequest) {
  try {
    const db = await getClient();
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get('operator') || 'all';
    const turnoFilter = searchParams.get('turno');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');

    const where: Prisma.ScanRecordWhereInput = {};
    if (operator !== 'all') where.codUti = operator;

    const allScans = await db.scanRecord.findMany({
      where,
      orderBy: [{ codUti: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }],
      select: {
        codUti: true, nomUti: true, fecha: true, hora: true,
        zonSts: true, codPro: true,
      },
    });

    // Group by operator + date
    const grouped = new Map<string, typeof allScans>();
    for (const s of allScans) {
      const key = `${s.codUti}|${s.fecha.toISOString().split('T')[0]}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }

    const rows: PickRow[] = [];

    for (const [, dayScans] of grouped) {
      const first = dayScans[0];
      const last = dayScans[dayScans.length - 1];
      const turno = getTurno(first.hora);

      if (turnoFilter && turno !== turnoFilter) continue;

      rows.push({
        codUti: first.codUti,
        nomUti: first.nomUti,
        fecha: first.fecha.toISOString().split('T')[0],
        turno,
        totalScans: dayScans.length,
        primerHora: first.hora,
        primerZona: first.zonSts,
        primerProducto: first.codPro,
        ultimoHora: last.hora,
        ultimoZona: last.zonSts,
        ultimoProducto: last.codPro,
        jornadaSec: horaToSec(last.hora) - horaToSec(first.hora),
      });
    }

    // Sort by date desc, then operator name
    rows.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return a.nomUti.localeCompare(b.nomUti);
    });

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paginatedRows = rows.slice(start, start + pageSize);

    return NextResponse.json({
      rows: paginatedRows,
      pagination: { page, pageSize, total, totalPages },
    });
  } catch (error) {
    console.error('Error fetching picks:', error);
    return NextResponse.json({ error: 'Error al obtener picks' }, { status: 500 });
  }
}