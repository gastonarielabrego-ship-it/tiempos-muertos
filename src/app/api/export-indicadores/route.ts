import { NextResponse } from 'next/server';
import { isTurso, tursoQuery } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function GET() {
  try {
    if (!isTurso) {
      return NextResponse.json({ error: 'Solo disponible en producción' }, { status: 400 });
    }

    const result = await tursoQuery(`SELECT * FROM "Indicador" ORDER BY "createdAt" DESC`);

    const wb = XLSX.utils.book_new();

    // Helper: minutes to "Xh Ym" string
    const minToH = (m: number) => {
      const hours = Math.floor(m / 60);
      const mins = Math.round(m % 60 * 10) / 10;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    };

    const minToDecH = (m: number) => (m / 60);

    const header = [
      'Fecha', 'Turno', 'T. Preparación', 'Colaboradores', 'Bultos',
      'TM Bruto', 'Descanso', 'TM Informado', 'TM Neto',
      'Cap. Equiv.', 'Bultos/h',
    ];

    const rows = result.rows.map(r => {
      const bruto = Number(r.brutoMin) || 0;
      const neto = Number(r.netoMin) || 0;
      const prep = Number(r.totalPreparacionMin) || 0;
      const bultos = Number(r.totalBultos) || 0;
      const prepH = minToDecH(prep);
      const capEquiv = prepH > 0 ? (minToDecH(bruto) / 8.35).toFixed(2) : '0.00';
      const bultosHora = prepH > 0 ? (bultos / prepH).toFixed(2) : '0.00';

      return [
        String(r.fecha),
        String(r.turno),
        minToH(prep),
        Number(r.totalColaboradores) || 0,
        bultos,
        minToH(bruto),
        minToH(Number(r.descansoMin) || 0),
        minToH(Number(r.tmInfMin) || 0),
        minToH(neto),
        capEquiv,
        bultosHora,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [
      { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 10 },
    ];

    // Style header row
    const headerColors = [
      'CCE5FF', 'CCE5FF', // Fecha, Turno - blue
      'E0F7FA',          // T. Preparación - cyan
      'F5F5F5',          // Colaboradores - gray
      'F5F5F5',          // Bultos - gray
      'FFCDD2',          // TM Bruto - red
      'FFF9C4',          // Descanso - yellow
      'E1BEE7',          // TM Informado - purple
      'C8E6C9',          // TM Neto - green
      'BBDEFB',          // Cap. Equiv. - blue
      'C8E6C9',          // Bultos/h - green
    ];

    for (let c = 0; c < header.length; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) {
        cell.s = {
          bold: true,
          fill: { fgColor: { rgb: headerColors[c] || 'F5F5F5' } },
          alignment: { horizontal: c <= 1 ? 'center' : 'right', vertical: 'center' },
          border: {
            top: { style: 'thin' },
            bottom: { style: 'thin' },
            left: { style: 'thin' },
            right: { style: 'thin' },
          },
        };
      }
    }

    // Style data rows
    for (let r = 1; r <= rows.length; r++) {
      for (let c = 0; c < header.length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) {
          cell.s = {
            border: {
              top: { style: 'thin', color: { rgb: 'E0E0E0' } },
              bottom: { style: 'thin', color: { rgb: 'E0E0E0' } },
              left: { style: 'thin', color: { rgb: 'E0E0E0' } },
              right: { style: 'thin', color: { rgb: 'E0E0E0' } },
            },
            alignment: {
              horizontal: c <= 1 ? 'center' : 'right',
              vertical: 'center',
            },
          };
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Indicadores');

    const dateStr = new Date().toISOString().split('T')[0];
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="indicadores_${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error exportando indicadores:', error);
    return NextResponse.json({ error: 'Error al exportar indicadores' }, { status: 500 });
  }
}