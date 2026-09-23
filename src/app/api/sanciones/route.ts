import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: Return all sanciones + counts per operator
export async function GET() {
  try {
    const sanciones = await db.sancion.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const countsByOp: Record<string, { count: number; lastDate: string }> = {};
    for (const s of sanciones) {
      if (!countsByOp[s.codUti]) {
        countsByOp[s.codUti] = { count: 0, lastDate: '' };
      }
      countsByOp[s.codUti].count++;
      const d = s.createdAt ? s.createdAt.toISOString() : '';
      if (d > countsByOp[s.codUti].lastDate) {
        countsByOp[s.codUti].lastDate = d.split('T')[0];
      }
    }

    return NextResponse.json({ sanciones, countsByOp, total: sanciones.length });
  } catch (error) {
    console.error('Error fetching sanciones:', error);
    return NextResponse.json({ sanciones: [], countsByOp: {}, total: 0 });
  }
}

// POST: Create a new sancion
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { codUti, nomUti, turno, tipo, tiempoNeto, bultos, fechaMedicion, coordinador, sectorCoordinador, rrhh, evidencia, comentariosColaborador, comentariosCoordinador, sugerencias } = body;

    if (!codUti || !nomUti) {
      return NextResponse.json({ error: 'codUti y nomUti son requeridos' }, { status: 400 });
    }

    const toStr = (v: unknown) => (v !== null && v !== undefined && v !== '') ? String(v) : null;

    await db.sancion.create({
      data: {
        codUti: String(codUti),
        nomUti: String(nomUti),
        turno: toStr(turno),
        tipo: toStr(tipo),
        tiempoNeto: tiempoNeto !== null && tiempoNeto !== undefined ? Number(tiempoNeto) : null,
        bultos: bultos !== null && bultos !== undefined ? Number(bultos) : null,
        fechaMedicion: toStr(fechaMedicion),
        coordinador: toStr(coordinador),
        sectorCoordinador: toStr(sectorCoordinador),
        rrhh: toStr(rrhh),
        evidencia: toStr(evidencia),
        comentariosColaborador: toStr(comentariosColaborador),
        comentariosCoordinador: toStr(comentariosCoordinador),
        sugerencias: toStr(sugerencias),
      },
    });

    const sancionCount = await db.sancion.count({ where: { codUti: String(codUti) } });

    return NextResponse.json({ success: true, sancionCount });
  } catch (error) {
    console.error('Error creating sancion:', error);
    const msg = error instanceof Error ? error.message : 'Error al crear sanción';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: Remove a sancion by id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }

    await db.sancion.delete({ where: { id: Number(id) } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sancion:', error);
    return NextResponse.json({ error: 'Error al eliminar sanción' }, { status: 500 });
  }
}
