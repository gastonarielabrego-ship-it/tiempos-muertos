import { NextRequest, NextResponse } from 'next/server';
import { isTurso, tursoQuery } from '@/lib/db';
import * as XLSX from 'xlsx';

// POST: Upload Excel with tiempos muertos informados
export async function POST(request: NextRequest) {
  try {
    if (!isTurso) {
      return NextResponse.json({ error: 'Solo disponible en producción (Turso)' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No se envió archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 });
    }

    // Clear existing data before loading new
    await tursoQuery('DELETE FROM "TiemposMuertosInf"');

    let inserted = 0;
    const BATCH_SIZE = 500;
    const values: string[] = [];

    for (const row of rows) {
      const fecha = row['FECHA'];
      const turno = row['TURNO'];
      const operario = row['OPERARIO'];
      const nombre = row['NOMBRE'] || null;
      const estado = row['ESTADO'] || null;
      const motivo = row['MOTIVO'] || null;
      const descripcionMotivo = row['DESCRIPCION_MOTIVO'] || null;
      const minutos = row['MINUTOS'] || 0;
      const fechaDesde = row['FECHA_DESDE'] || fecha;

      if (!operario) continue;

      const fechaNum = Number(fecha) || 0;
      const fechaDesdeNum = Number(fechaDesde) || 0;
      const minutosNum = Number(minutos) || 0;
      const motivoNum = Number(motivo) || null;

      values.push(`(${fechaNum},${turno ? `'${String(turno)}'` : "'TM'"},'${String(operario)}',${nombre ? `'${String(nombre).replace(/'/g, "''")}'` : 'NULL'},${estado ? `'${String(estado)}'` : 'NULL'},${motivoNum},${descripcionMotivo ? `'${String(descripcionMotivo).replace(/'/g, "''")}'` : 'NULL'},${minutosNum},${fechaDesdeNum})`);
      inserted++;
    }

    // Insert in batches
    for (let i = 0; i < values.length; i += BATCH_SIZE) {
      const batch = values.slice(i, i + BATCH_SIZE).join(',');
      await tursoQuery(
        `INSERT INTO "TiemposMuertosInf" ("fecha","turno","operario","nombre","estado","motivo","descripcionMotivo","minutos","fechaDesde") VALUES ${batch}`
      );
    }

    return NextResponse.json({
      success: true,
      totalRecords: inserted,
    });
  } catch (error) {
    console.error('Error cargando TM informados:', error);
    return NextResponse.json({ error: 'Error al cargar archivo' }, { status: 500 });
  }
}

// GET: Return total minutes per operator
export async function GET() {
  try {
    if (!isTurso) {
      return NextResponse.json({ byOperator: {} });
    }

    const result = await tursoQuery(`
      SELECT "operario", SUM("minutos") as totalMinutos, COUNT(*) as registros
      FROM "TiemposMuertosInf"
      GROUP BY "operario"
    `);

    const byOperator: Record<string, { totalMinutos: number; registros: number }> = {};
    for (const row of result.rows) {
      byOperator[String(row.operario)] = {
        totalMinutos: Number(row.totalMinutos),
        registros: Number(row.registros),
      };
    }

    return NextResponse.json({ byOperator });
  } catch (error) {
    console.error('Error consultando TM informados:', error);
    return NextResponse.json({ byOperator: {} });
  }
}