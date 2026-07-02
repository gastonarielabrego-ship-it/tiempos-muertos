import { NextRequest, NextResponse } from 'next/server';
import { db, isTurso, tursoQuery } from '@/lib/db';
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

function fmtSec(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtHMS(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const turnoFilter = searchParams.get('turno');
    const fechaFilter = searchParams.get('fecha');

    const where: Record<string, unknown> = {};
    if (fechaFilter) where.fecha = fechaFilter;

    const scans = await db.scanRecord.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: [{ codUti: 'asc' }, { fecha: 'asc' }, { hora: 'asc' }],
    });

    if (scans.length === 0) {
      return new NextResponse('Sin datos', { status: 404 });
    }

    // Group by operator+date
    const grouped = new Map<string, typeof scans>();
    for (const s of scans) {
      const fechaStr = s.fecha instanceof Date ? s.fecha.toISOString().split('T')[0] : String(s.fecha).split('T')[0];
      const key = `${s.codUti}|${fechaStr}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(s);
    }

    let totalDeadTime = 0;
    let deadTimeEvents = 0;
    let maxGap = 0;
    let deadTimeGapSum = 0;

    const shiftData: Record<Turno, { sec: number; events: number }> = {
      TM: { sec: 0, events: 0 }, TT: { sec: 0, events: 0 }, TN: { sec: 0, events: 0 },
    };

    const bultosMap = new Map<string, number>();
    for (const s of scans) {
      bultosMap.set(s.codUti, (bultosMap.get(s.codUti) || 0) + s.bultos);
    }

    const opMap = new Map<string, {
      name: string; deadSec: number; events: number; maxSec: number;
      turnos: Record<Turno, number>; dias: Set<string>;
    }>();

    for (const [, dayScans] of grouped) {
      for (let i = 1; i < dayScans.length; i++) {
        const prev = dayScans[i - 1];
        const curr = dayScans[i];
        const p = prev.hora.split(':').map(Number);
        const c = curr.hora.split(':').map(Number);
        const gap = (c[0] * 3600 + c[1] * 60 + c[2]) - (p[0] * 3600 + p[1] * 60 + p[2]);

        if (gap > 0) {
          if (gap > maxGap) maxGap = gap;
          if (gap > DEAD_TIME_THRESHOLD) {
            const turno: Turno = getTurno(curr.hora);
            if (turnoFilter && turno !== turnoFilter) continue;

            totalDeadTime += gap;
            deadTimeEvents++;
            deadTimeGapSum += gap;
            shiftData[turno].sec += gap;
            shiftData[turno].events++;

            if (!opMap.has(curr.codUti)) {
              opMap.set(curr.codUti, { name: curr.nomUti, deadSec: 0, events: 0, maxSec: 0, turnos: { TM: 0, TT: 0, TN: 0 }, dias: new Set() });
            }
            const entry = opMap.get(curr.codUti)!;
            entry.deadSec += gap;
            const currFecha = curr.fecha instanceof Date ? curr.fecha.toISOString().split('T')[0] : String(curr.fecha).split('T')[0];
            entry.dias.add(currFecha);
            entry.events++;
            entry.turnos[turno] += gap;
            if (gap > entry.maxSec) entry.maxSec = gap;
          }
        }
      }
    }

    // Fetch TM informados (same logic as /api/stats)
    let tmInfMap: Record<string, number> = {};
    if (isTurso) {
      try {
        const tmResult = await tursoQuery(`
          SELECT "operario", SUM("minutos") as totalMinutos
          FROM "TiemposMuertosInf"
          GROUP BY "operario"
        `);
        for (const row of tmResult.rows) {
          tmInfMap[String(row.operario)] = Number(row.totalMinutos);
        }
      } catch (e) {
        console.error('[export-ranking] Error fetching TM informados:', e);
      }
    }

    const byOperator = Array.from(opMap.entries())
      .map(([cod, d]) => {
        const predTurno: Turno = (['TM', 'TT', 'TN'] as Turno[]).sort((a, b) => d.turnos[b] - d.turnos[a])[0];
        const brutoMin = Math.round((d.deadSec / 60) * 10) / 10;
        const tmInfMin = Math.round((tmInfMap[cod] || 0) * 10) / 10;
        const brutoAjustadoMin = Math.max(0, Math.round((brutoMin - tmInfMin) * 10) / 10);
        const descansoBruto = d.dias.size * 60;
        const descansoReal = Math.min(descansoBruto, brutoAjustadoMin);
        const netoMin = Math.round((brutoAjustadoMin - descansoReal) * 10) / 10;
        return {
          cod, name: d.name,
          brutoMin, brutoSec: d.deadSec,
          tmInfMin,
          brutoAjustadoMin, brutoAjustadoSec: Math.round(brutoAjustadoMin * 60),
          descansoReal, descansoSec: descansoReal * 60,
          netoMin, netoSec: Math.round(netoMin * 60),
          dias: d.dias.size, events: d.events, maxSec: d.maxSec,
          turno: predTurno, bultos: bultosMap.get(cod) || 0,
        };
      })
      .sort((a, b) => b.brutoAjustadoMin - a.brutoAjustadoMin);

    // --- Build Excel ---

    const wb = XLSX.utils.book_new();

    // Sheet 1: Ranking
    const rHeader = [
      '#', 'Legajo', 'Apellido y Nombre', 'Turno Pred.',
      'T. Muerto Inf. (min)', 'T. Bruto (min)', 'T. Bruto (HH:MM:SS)',
      'T. Bruto Ajust. (min)', 'T. Bruto Ajust. (HH:MM:SS)',
      'Descanso (min)', 'Descanso (HH:MM:SS)',
      'T. Neto (min)', 'T. Neto (HH:MM:SS)',
      'Dias Trab.', 'Eventos', 'Mayor Gap', 'Mayor Gap (HH:MM:SS)', 'Bultos',
    ];
    const rRows = byOperator.map((op, i) => [
      i + 1, op.cod, op.name, op.turno,
      op.tmInfMin,
      op.brutoMin, fmtHMS(op.brutoSec),
      op.brutoAjustadoMin, fmtHMS(op.brutoAjustadoSec),
      op.descansoReal, fmtHMS(op.descansoSec),
      op.netoMin, fmtHMS(op.netoSec),
      op.dias, op.events,
      fmtSec(op.maxSec), fmtHMS(op.maxSec),
      op.bultos,
    ]);

    const ws1 = XLSX.utils.aoa_to_sheet([rHeader, ...rRows]);
    ws1['!cols'] = [
      { wch: 4 }, { wch: 16 }, { wch: 28 }, { wch: 10 },
      { wch: 18 }, { wch: 16 }, { wch: 16 },
      { wch: 20 }, { wch: 20 },
      { wch: 14 }, { wch: 16 },
      { wch: 16 }, { wch: 16 },
      { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 16 },
      { wch: 10 },
    ];

    // Bold header style - red for TM Inf column, blue for bruto, green for neto
    const headerColors: Record<number, string> = {
      4: 'E8D5F5',  // TM Informados - purple
      5: 'FFE0E0',  // Bruto - red
      6: 'FFE0E0',
      7: 'D6EAF8',  // Bruto Ajustado - blue
      8: 'D6EAF8',
      9: 'F5F5F5',  // Descanso - grey
      10: 'F5F5F5',
      11: 'D5F5E3', // Neto - green
      12: 'D5F5E3',
    };
    for (let c = 0; c < rHeader.length; c++) {
      const cell = ws1[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { bold: true, fill: { fgColor: { rgb: headerColors[c] || 'FFEBEE' } } };
    }

    // Total row
    const totalRowIdx = rRows.length + 1;
    const totalBruto = Math.round(byOperator.reduce((s, o) => s + o.brutoMin, 0) * 10) / 10;
    const totalTmInf = Math.round(byOperator.reduce((s, o) => s + o.tmInfMin, 0) * 10) / 10;
    const totalBrutoAjust = Math.round(byOperator.reduce((s, o) => s + o.brutoAjustadoMin, 0) * 10) / 10;
    const totalNeto = Math.round(byOperator.reduce((s, o) => s + o.netoMin, 0) * 10) / 10;
    const totalBultos = byOperator.reduce((s, o) => s + o.bultos, 0);
    ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c: 0 })] = { t: 's', v: '' };
    ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c: 1 })] = { t: 's', v: 'TOTAL' };
    ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c: 4 })] = { t: 'n', v: totalTmInf };
    ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c: 5 })] = { t: 'n', v: totalBruto };
    ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c: 7 })] = { t: 'n', v: totalBrutoAjust };
    ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c: 11 })] = { t: 'n', v: totalNeto };
    ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c: 14 })] = { t: 'n', v: deadTimeEvents };
    ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c: 17 })] = { t: 'n', v: totalBultos };
    for (let c = 0; c < rHeader.length; c++) {
      const cell = ws1[XLSX.utils.encode_cell({ r: totalRowIdx, c })];
      if (cell) cell.s = { bold: true, fill: { fgColor: { rgb: 'FFF3CD' } } };
    }

    XLSX.utils.book_append_sheet(wb, ws1, 'Ranking');

    // Sheet 2: Resumen General
    const avgGap = deadTimeEvents > 0 ? Math.round(deadTimeGapSum / deadTimeEvents) : 0;
    const summary = [
      ['RESUMEN GENERAL - TIEMPOS MUERTOS OPERATIVOS'],
      [''],
      ['Total Escaneos', scans.length],
      ['Total Eventos > 5 min', deadTimeEvents],
      ['Tiempo Muerto Bruto Total', fmtSec(totalDeadTime), `${Math.round(totalDeadTime / 60)} min`],
      ['T. Muerto Informados Total', `${Math.round(totalTmInf)} min`],
      ['T. Muerto Ajustado Total', `${Math.round(totalBrutoAjust)} min`],
      ['T. Muerto Neto Total', `${Math.round(totalNeto)} min`],
      ['Promedio por Evento', fmtSec(avgGap)],
      ['Mayor Gap General', fmtSec(maxGap)],
      [''],
      ['POR TURNO'],
      ['Turno', 'Tiempo', 'Eventos', 'Promedio'],
      ['TM (6-14hs)', fmtSec(shiftData.TM.sec), shiftData.TM.events, shiftData.TM.events > 0 ? fmtSec(Math.round(shiftData.TM.sec / shiftData.TM.events)) : '-'],
      ['TT (14-22hs)', fmtSec(shiftData.TT.sec), shiftData.TT.events, shiftData.TT.events > 0 ? fmtSec(Math.round(shiftData.TT.sec / shiftData.TT.events)) : '-'],
      ['TN (22-6hs)', fmtSec(shiftData.TN.sec), shiftData.TN.events, shiftData.TN.events > 0 ? fmtSec(Math.round(shiftData.TN.sec / shiftData.TN.events)) : '-'],
      [''],
      ['Filtros Aplicados'],
      ['Turno', turnoFilter === 'all' || !turnoFilter ? 'Todos' : turnoFilter],
      ['Fecha', fechaFilter === 'all' || !fechaFilter ? 'Todas' : fechaFilter],
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];

    // Bold for title and section headers
    [0, 10, 16].forEach(r => {
      const cell = ws2[XLSX.utils.encode_cell({ r, c: 0 })];
      if (cell) cell.s = { bold: true, fill: { fgColor: { rgb: 'D4EDDA' } } };
    });

    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen General');

    const dateStr = new Date().toISOString().split('T')[0];
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ranking_tiempos_muertos_${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error exporting ranking:', error);
    return NextResponse.json({ error: 'Error al exportar ranking' }, { status: 500 });
  }
}