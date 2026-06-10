import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const db = await getClient();
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
    const firstRow = rows[0];
    const missing = required.filter(col => !(col in firstRow));
    if (missing.length > 0) {
      return NextResponse.json({ error: `Faltan columnas: ${missing.join(', ')}` }, { status: 400 });
    }

    // Delete existing data and insert new
    await db.scanRecord.deleteMany({});

    const records = rows.map(row => {
      let fecha: Date;
      const rawFecha = row['FECHA'];
      if (rawFecha instanceof Date) {
        fecha = rawFecha;
      } else if (typeof rawFecha === 'number') {
        // Excel serial date
        const excelEpoch = new Date(1899, 11, 30);
        fecha = new Date(excelEpoch.getTime() + rawFecha * 86400000);
      } else if (typeof rawFecha === 'string') {
        fecha = new Date(rawFecha);
      } else {
        fecha = new Date();
      }

      let hora = '';
      if (rawFecha instanceof Date && row['HORA']) {
        // HORA might be a time object - reconstruct from the datetime
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
      }

      return {
        codUti: String(row['CODUTI'] || ''),
        nomUti: String(row['NOMUTI'] || ''),
        fecha,
        hora,
        codAct: Number(row['CODACT']) || 0,
        zonSts: row['ZONSTS'] ? String(row['ZONSTS']) : null,
        allSts: Number(row['ALLSTS']) || 0,
        dplSts: Number(row['DPLSTS']) || 0,
        nivSts: Number(row['NIVSTS']) || 0,
        codPro: String(row['CODPRO'] || ''),
        pcbPro: Number(row['PCBPRO']) || 0,
        bultos: Number(row['BULTOS']) || 0,
      };
    });

    // Insert in batches of 2000 for performance
    const BATCH_SIZE = 2000;
    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      await db.scanRecord.createMany({ data: batch });
      inserted += batch.length;
    }

    return NextResponse.json({
      success: true,
      message: `Datos cargados exitosamente`,
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