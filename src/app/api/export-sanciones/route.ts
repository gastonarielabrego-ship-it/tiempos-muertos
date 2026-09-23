import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function GET() {
  try {
    // Fetch all sanciones
    const sanciones = await db.sancion.findMany({
      orderBy: { createdAt: 'desc' },
    });

    // Fetch TM informados per operator
    const tmInfMap: Record<string, { min: number; ev: number }> = {};
    try {
      const tmInfRows = await db.tiemposMuertosInf.groupBy({
        by: ['operario'],
        _sum: { minutos: true },
        _count: { _all: true },
      });
      for (const row of tmInfRows) {
        tmInfMap[row.operario] = { min: row._sum.minutos || 0, ev: row._count._all };
      }
    } catch (e) {
      console.error('[export-sanciones] Error fetching TM informados:', e);
    }

    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Historial Sanciones ---
    const h1Header = [
      '#', 'Fecha Registro', 'Legajo', 'Nombre', 'Turno', 'Bultos',
      'T. Neto (min)', 'Fecha Medición', 'Coordinador', 'Sector',
      'RRHH', 'TM Inf. (min)', 'Ev. TM Inf.',
      'Coment. Colaborador', 'Coment. Coordinador',
    ];
    const h1Rows = sanciones.map((r, i) => {
      const cod = r.codUti;
      const tmInf = tmInfMap[cod] || { min: 0, ev: 0 };
      const created = r.createdAt ? r.createdAt.toISOString().replace('T', ' ').substring(0, 19) : '';
      return [
        i + 1,
        created,
        cod,
        r.nomUti,
        r.turno || '',
        r.bultos || 0,
        r.tiempoNeto || 0,
        r.fechaMedicion || '',
        r.coordinador || '',
        r.sectorCoordinador || '',
        r.rrhh || '',
        tmInf.min,
        tmInf.ev,
        r.comentariosColaborador || '',
        r.comentariosCoordinador || '',
      ];
    });

    const ws1 = XLSX.utils.aoa_to_sheet([h1Header, ...h1Rows]);
    ws1['!cols'] = [
      { wch: 4 }, { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
      { wch: 16 }, { wch: 14 }, { wch: 12 },
      { wch: 30 }, { wch: 30 },
    ];

    // Bold header
    for (let c = 0; c < h1Header.length; c++) {
      const cell = ws1[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { bold: true, fill: { fgColor: { rgb: 'FFE0E0' } } };
    }

    XLSX.utils.book_append_sheet(wb, ws1, 'Historial Sanciones');

    // --- Sheet 2: Resumen por Operador ---
    const opSummary: Record<string, { nombre: string; count: number; lastDate: string; netoTotal: number }> = {};
    for (const r of sanciones) {
      const cod = r.codUti;
      if (!opSummary[cod]) {
        opSummary[cod] = { nombre: r.nomUti, count: 0, lastDate: '', netoTotal: 0 };
      }
      opSummary[cod].count++;
      opSummary[cod].netoTotal += r.tiempoNeto || 0;
      const date = r.createdAt ? r.createdAt.toISOString() : '';
      if (date > opSummary[cod].lastDate) opSummary[cod].lastDate = date.replace('T', ' ').substring(0, 19);
    }

    const sortedOps = Object.entries(opSummary).sort((a, b) => b[1].count - a[1].count);

    const h2Header = ['Legajo', 'Nombre', 'Cant. Sanciones', 'Última Sanción', 'T. Neto Total (min)', 'TM Inf. Total (min)', 'Ev. TM Inf. Total'];
    const h2Rows = sortedOps.map(([cod, d]) => {
      const tmInf = tmInfMap[cod] || { min: 0, ev: 0 };
      return [cod, d.nombre, d.count, d.lastDate, d.netoTotal, tmInf.min, tmInf.ev];
    });

    const ws2 = XLSX.utils.aoa_to_sheet([h2Header, ...h2Rows]);
    ws2['!cols'] = [
      { wch: 12 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
    ];

    for (let c = 0; c < h2Header.length; c++) {
      const cell = ws2[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { bold: true, fill: { fgColor: { rgb: 'D4EDDA' } } };
    }

    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por Operador');

    const dateStr = new Date().toISOString().split('T')[0];
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="sanciones_${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error exportando sanciones:', error);
    return NextResponse.json({ error: 'Error al exportar sanciones' }, { status: 500 });
  }
}
