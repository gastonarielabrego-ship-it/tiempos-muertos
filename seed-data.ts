import { db } from '@/lib/db';
import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { join } from 'path';

async function seedData() {
  console.log('Starting data seed...');

  const filePath = join(process.cwd(), 'upload', 'tiempos muertos operacion.xlsx');
  const buffer = readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

  console.log(`Total rows in Excel: ${rows.length}`);

  await db.scanRecord.deleteMany({});
  console.log('Cleared existing data');

  const records = rows.map((row) => {
    let fecha: Date;
    const rawFecha = row['FECHA'];
    if (rawFecha instanceof Date) {
      fecha = rawFecha;
    } else if (typeof rawFecha === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      fecha = new Date(excelEpoch.getTime() + rawFecha * 86400000);
    } else if (typeof rawFecha === 'string') {
      fecha = new Date(rawFecha);
    } else {
      fecha = new Date();
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

  const BATCH_SIZE = 3000;
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await db.scanRecord.createMany({ data: batch });
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${records.length}...`);
  }

  console.log(`Done! Total: ${inserted}`);
  await db.$disconnect();
}

seedData().catch(console.error);