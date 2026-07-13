import { NextRequest, NextResponse } from 'next/server';
import { isTurso, tursoQuery } from '@/lib/db';

// Receives pre-parsed rows in JSON batches (client parses xlsx to avoid Vercel size limits)
export async function POST(request: NextRequest) {
  try {
    if (!isTurso) {
      return NextResponse.json({ error: 'Solo disponible en producción (Turso)' }, { status: 400 });
    }

    const body = await request.json();
    const { rows, clearFirst, totalExpected } = body;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No se proporcionaron datos' }, { status: 400 });
    }

    // Clear existing data on first batch
    if (clearFirst) {
      await tursoQuery('DELETE FROM "ScanRecord"');
    }

    const values: string[] = [];

    for (const row of rows) {
      const codUti = String(row.codUti || '').replace(/'/g, "''");
      const nomUti = String(row.nomUti || '').replace(/'/g, "''");
      const fecha = String(row.fecha || '');
      const hora = String(row.hora || '');
      const zonSts = row.zonSts ? `'${String(row.zonSts).replace(/'/g, "''")}'` : 'NULL';
      const codPro = String(row.codPro || '').replace(/'/g, "''");

      values.push(`('${codUti}','${nomUti}','${fecha}','${hora}',${Number(row.codAct) || 0},${zonSts},${Number(row.allSts) || 0},${Number(row.dplSts) || 0},${Number(row.nivSts) || 0},'${codPro}',${Number(row.pcbPro) || 0},${Number(row.bultos) || 0},CURRENT_TIMESTAMP)`);
    }

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE).join(',');
      await tursoQuery(
        `INSERT INTO "ScanRecord" ("codUti","nomUti","fecha","hora","codAct","zonSts","allSts","dplSts","nivSts","codPro","pcbPro","bultos","createdAt") VALUES ${batch}`
      );
      inserted += Math.min(BATCH_SIZE, values.length - i);
    }

    return NextResponse.json({
      success: true,
      inserted,
      totalExpected: totalExpected || rows.length,
    });
  } catch (error) {
    console.error('Error uploading batch:', error);
    return NextResponse.json(
      { error: 'Error al procesar: ' + (error instanceof Error ? error.message : 'Desconocido') },
      { status: 500 }
    );
  }
}