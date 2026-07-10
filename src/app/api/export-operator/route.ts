import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

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

function fmtHMS(sec: number): string {
  if (sec < 0) return '00:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const operator = searchParams.get('operator');
    const turnoFilter = searchParams.get('turno');
    const fechaFilter = searchParams.get('fecha');
    const zonaFilter = searchParams.get('zona');

    if (!operator || operator === 'all') {
      return NextResponse.json({ error: 'Se requiere un operador' }, { status: 400 });
    }

    const where: Record<string, unknown> = { codUti: operator };
    if (fechaFilter) where.fecha = fechaFilter;

    let allScans = await db.scanRecord.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });

    // Filter by zona type
    if (zonaFilter === 'std') {
      allScans = allScans.filter((s: any) => !s.zonSts || !String(s.zonSts).toUpperCase().includes('V'));
    } else if (zonaFilter === 'xd') {
      allScans = allScans.filter((s: any) => s.zonSts && String(s.zonSts).toUpperCase().includes('V'));
    }

    // Group by day
    const grouped = new Map<string, typeof allScans>();
    const diasSet = new Set<string>();
    for (const s of allScans) {
      const fechaStr = s.fecha instanceof Date ? s.fecha.toISOString().split('T')[0] : String(s.fecha).split('T')[0];
      const key = fechaStr;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
      diasSet.add(fechaStr);
    }

    interface GapRow {
      rank: number;
      fecha: string;
      gapSeconds: number;
      turno: Turno;
      prevHora: string;
      prevZonSts: string | null;
      prevCodPro: string;
      currHora: string;
      currZonSts: string | null;
      currCodPro: string;
    }

    const gaps: GapRow[] = [];
    let totalDeadTimeSec = 0;

    for (const [, dayScans] of grouped) {
      for (let i = 1; i < dayScans.length; i++) {
        const prev = dayScans[i - 1];
        const curr = dayScans[i];
        const p = prev.hora.split(':').map(Number);
        const c = curr.hora.split(':').map(Number);
        const gap = (c[0] * 3600 + c[1] * 60 + c[2]) - (p[0] * 3600 + p[1] * 60 + p[2]);

        if (gap > DEAD_TIME_THRESHOLD) {
          const turno: Turno = getTurno(curr.hora);
          if (turnoFilter && turno !== turnoFilter) continue;

          totalDeadTimeSec += gap;
          gaps.push({
            rank: 0,
            fecha: curr.fecha instanceof Date ? curr.fecha.toISOString().split('T')[0] : String(curr.fecha).split('T')[0],
            gapSeconds: gap,
            turno,
            prevHora: prev.hora,
            prevZonSts: prev.zonSts,
            prevCodPro: prev.codPro,
            currHora: curr.hora,
            currZonSts: curr.zonSts,
            currCodPro: curr.codPro,
          });
        }
      }
    }

    gaps.sort((a, b) => b.gapSeconds - a.gapSeconds);
    gaps.forEach((g, i) => { g.rank = i + 1; });

    const opName = allScans.length > 0 ? allScans[0].nomUti : operator;
    const brutoSec = totalDeadTimeSec;
    const descansoSec = diasSet.size * 2100;
    const descansoReal = Math.min(descansoSec, brutoSec);
    const netoSec = brutoSec - descansoReal;
    const maxGap = gaps.length > 0 ? gaps[0].gapSeconds : 0;

    // Build Excel workbook
    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Resumen ---
    const summaryData = [
      ['TIEMPOS MUERTOS - DETALLE POR OPERADOR'],
      [],
      ['Operador', opName],
      ['Codigo', operator],
      ['Turno Predominante', gaps.length > 0 ? (() => {
        const counts: Record<string, number> = { TM: 0, TT: 0, TN: 0 };
        gaps.forEach(g => counts[g.turno] += g.gapSeconds);
        return (Object.entries(counts).sort(([, a], [, b]) => b - a)[0][0]);
      })() : '—'],
      ['Fecha Filtro', fechaFilter || 'Todas'],
      ['Turno Filtro', turnoFilter || 'Todos'],
      [],
      ['RESUMEN'],
      ['Dias Trabajados', diasSet.size],
      ['Eventos (>5 min)', gaps.length],
      ['Tiempo Bruto', fmtHMS(brutoSec), `${Math.round(brutoSec / 60)} min`],
      ['Descanso', `-${fmtHMS(descansoReal)}`, `-${Math.round(descansoReal / 60)} min`, `${diasSet.size} dias x 35 min`],
      ['Tiempo Neto', fmtHMS(netoSec), `${Math.round(netoSec / 60)} min`],
      ['Mayor Gap', fmtHMS(maxGap)],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);

    // Set column widths
    ws1['!cols'] = [
      { wch: 22 },
      { wch: 25 },
      { wch: 20 },
      { wch: 22 },
    ];

    // Style title
    if (ws1['A1']) {
      ws1['A1'].s = { font: { bold: true, sz: 14 } };
    }

    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');

    // --- Sheet 2: Detalle de Gaps ---
    const header = ['#', 'Fecha', 'Turno', 'Hora Previo', 'Zona Previo', 'Producto Previo', 'Gap', 'HH:MM:SS', 'Hora Posterior', 'Zona Posterior', 'Producto Posterior'];
    const rows = gaps.map(g => [
      g.rank,
      g.fecha,
      g.turno,
      g.prevHora,
      g.prevZonSts || '',
      g.prevCodPro,
      `${Math.round(g.gapSeconds / 60)} min`,
      fmtHMS(g.gapSeconds),
      g.currHora,
      g.currZonSts || '',
      g.currCodPro,
    ]);

    // Add descanso row at the bottom
    if (descansoReal > 0) {
      rows.push([]);
      rows.push(['', '', '', '', '', 'DESCANSO', `-${Math.round(descansoReal / 60)} min`, `-${fmtHMS(descansoReal)}`, '', '', '']);
      rows.push(['', '', '', '', '', 'TIEMPO NETO TOTAL', `${Math.round(netoSec / 60)} min`, fmtHMS(netoSec), '', '', '']);
    }

    const ws2 = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws2['!cols'] = [
      { wch: 5 },
      { wch: 12 },
      { wch: 7 },
      { wch: 11 },
      { wch: 14 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 18 },
    ];

    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle Gaps');

    // Generate buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const filename = `tiempos_muertos_${opName.replace(/\s+/g, '_')}_${fechaFilter || 'todas'}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting operator:', error);
    return NextResponse.json({ error: 'Error al generar Excel' }, { status: 500 });
  }
}