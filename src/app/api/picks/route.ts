import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
  primerHora: string;
  primerZona: string | null;
  primerProducto: string;
  ultimoHora: string;
  ultimoZona: string | null;
  ultimoProducto: string;
  jornadaSec: number;
  descansoSec: number;
  jornadaEfectivaSec: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get('operator') || 'all';
    const turnoFilter = searchParams.get('turno');
    const fechaFilter = searchParams.get('fecha');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');

    const where: Record<string, unknown> = {};
    if (operator !== 'all') where.codUti = operator;
    if (fechaFilter) where.fecha = fechaFilter;

    const allScans = await db.scanRecord.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ codUti: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }],
    });

    const grouped = new Map<string, typeof allScans>();
    for (const s of allScans) {
      const fechaStr = s.fecha instanceof Date ? s.fecha.toISOString().split('T')[0] : String(s.fecha).split('T')[0];
      const key = `${s.codUti}|${fechaStr}`;
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
        fecha: first.fecha instanceof Date ? first.fecha.toISOString().split('T')[0] : String(first.fecha).split('T')[0],
        turno,
        totalScans: dayScans.length,
        primerHora: first.hora,
        primerZona: first.zonSts,
        primerProducto: first.codPro,
        ultimoHora: last.hora,
        ultimoZona: last.zonSts,
        ultimoProducto: last.codPro,
        jornadaSec: horaToSec(last.hora) - horaToSec(first.hora),
        descansoSec: 3600,
        jornadaEfectivaSec: Math.max(0, horaToSec(last.hora) - horaToSec(first.hora) - 3600),
      });
    }

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
    return NextResponse.json({ error: 'Error al obtener selecciones' }, { status: 500 });
  }
}