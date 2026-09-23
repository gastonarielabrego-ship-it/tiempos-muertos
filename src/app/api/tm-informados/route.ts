import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import * as XLSX from 'xlsx';

// POST: Upload Excel with tiempos muertos informados
export async function POST(request: NextRequest) {
  try {
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
    await db.tiemposMuertosInf.deleteMany();

    const data: {
      fecha: number;
      turno: string;
      operario: string;
      nombre: string | null;
      estado: string | null;
      motivo: number | null;
      descripcionMotivo: string | null;
      minutos: number;
      fechaDesde: number | null;
    }[] = [];

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

      data.push({
        fecha: Number(fecha) || 0,
        turno: turno ? String(turno) : 'TM',
        operario: String(operario),
        nombre: nombre ? String(nombre) : null,
        estado: estado ? String(estado) : null,
        motivo: Number(motivo) || null,
        descripcionMotivo: descripcionMotivo ? String(descripcionMotivo) : null,
        minutos: Number(minutos) || 0,
        fechaDesde: Number(fechaDesde) || null,
      });
    }

    // Insert in batches of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      await db.tiemposMuertosInf.createMany({ data: batch });
    }

    return NextResponse.json({
      success: true,
      totalRecords: data.length,
    });
  } catch (error) {
    console.error('Error cargando TM informados:', error);
    return NextResponse.json({ error: 'Error al cargar archivo' }, { status: 500 });
  }
}

// GET: Return total minutes per operator
export async function GET() {
  try {
    const result = await db.tiemposMuertosInf.groupBy({
      by: ['operario'],
      _sum: { minutos: true },
      _count: { _all: true },
    });

    const byOperator: Record<string, { totalMinutos: number; registros: number }> = {};
    for (const row of result) {
      byOperator[row.operario] = {
        totalMinutos: row._sum.minutos || 0,
        registros: row._count._all,
      };
    }

    return NextResponse.json({ byOperator });
  } catch (error) {
    console.error('Error consultando TM informados:', error);
    return NextResponse.json({ byOperator: {} });
  }
}
