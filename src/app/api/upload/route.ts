import { NextRequest, NextResponse } from 'next/server';
import { isTurso, tursoQuery } from '@/lib/db';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    if (!isTurso) {
      return NextResponse.json({ error: 'Solo disponible en producción (Turso)' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'El archivo está vacío o no tiene datos' }, { status: 400 });
    }

    // Validate columns
    const required = ['CODUTI', 'NOMUTI', 'FECHA', 'HORA', 'CODACT', 'ZONSTS', 'ALLSTS', 'DPLSTS', 'NIVSTS', 'CODPRO', 'PCBPRO', 'BULTOS'];
    const firstRow = rows[0] as Record<string, unknown>;
    const missing = required.filter(col => !(col in firstRow));
    if (missing.length > 0) {
      return NextResponse.json({ error: `Faltan columnas: ${missing.join(', ')}` }, { status: 400 });
    }

    // Delete existing data and insert new
    await tursoQuery('DELETE FROM "ScanRecord"');

    const BATCH_SIZE = 500;
    let inserted = 0;
    const values: string[] = [];

    for (const row of rows) {
      let fechaStr: string;
      const rawFecha = row['FECHA'];
      if (rawFecha instanceof Date) {
        fechaStr = rawFecha.toISOString();
      } else if (typeof rawFecha === 'number') {
        // Excel serial date
        const excelEpoch = new Date(1899, 11, 30);
        fechaStr = new Date(excelEpoch.getTime() + rawFecha * 86400000).toISOString();
      } else if (typeof rawFecha === 'string') {
        fechaStr = new Date(rawFecha).toISOString();
      } else {
        fechaStr = new Date().toISOString();
      }

      let hora = '';
      const rawHora = row['HORA'];
      if (typeof rawHora === 'number') {
        const totalSeconds = Math.floor(rawHora * 86400);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        hora = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      } else if (typeof rawHora === 'string') {
        hora = rawHora;
      } else if (rawHora instanceof Date) {
        hora = rawHora.toTimeString().slice(0, 8);
      }

      const codUti = String(row['CODUTI'] || '').replace(/'/g, "''");
      const nomUti = String(row['NOMUTI'] || '').replace(/'/g, "''");
      const zonSts = row['ZONSTS'] ? `'${String(row['ZONSTS']).replace(/'/g, "''")}'` : 'NULL';
      const codPro = String(row['CODPRO'] || '').replace(/'/g, "''");

      values.push(`('${codUti}','${nomUti}','${fechaStr}','${hora}',${Number(row['CODACT']) || 0},${zonSts},${Number(row['ALLSTS']) || 0},${Number(row['DPLSTS']) || 0},${Number(row['NIVSTS']) || 0},'${codPro}',${Number(row['PCBPRO']) || 0},${Number(row['BULTOS']) || 0},CURRENT_TIMESTAMP)`);
      inserted++;
    }

    // Insert in batches
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE).join(',');
      await tursoQuery(
        `INSERT INTO "ScanRecord" ("codUti","nomUti","fecha","hora","codAct","zonSts","allSts","dplSts","nivSts","codPro","pcbPro","bultos","createdAt") VALUES ${batch}`
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Datos cargados exitosamente',
      totalRecords: inserted,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Error al procesar el archivo: ' + (error instanceof Error ? error.message : 'Desconocido') },
      { status: 500 }
    );
  }
}