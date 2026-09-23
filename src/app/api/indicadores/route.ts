import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET: List all indicadores
export async function GET() {
  try {
    const indicadores = await db.indicador.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ indicadores });
  } catch (error) {
    console.error('Error fetching indicadores:', error);
    return NextResponse.json({ indicadores: [] });
  }
}

// POST: Save a new indicador snapshot
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fecha, turno, brutoMin, descansoMin, tmInfMin, tmInfEventos, netoMin, totalBultos, totalPreparacionMin, totalColaboradores } = body;
    if (!fecha) {
      return NextResponse.json({ error: 'fecha es requerida' }, { status: 400 });
    }
    await db.indicador.create({
      data: {
        fecha: String(fecha),
        turno: String(turno || 'todos'),
        brutoMin: Number(brutoMin) || 0,
        descansoMin: Number(descansoMin) || 0,
        tmInfMin: Number(tmInfMin) || 0,
        tmInfEventos: Number(tmInfEventos) || 0,
        netoMin: Number(netoMin) || 0,
        totalBultos: Number(totalBultos) || 0,
        totalPreparacionMin: Number(totalPreparacionMin) || 0,
        totalColaboradores: Number(totalColaboradores) || 0,
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving indicador:', error);
    const msg = error instanceof Error ? error.message : 'Error al guardar indicador';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: Remove an indicador by id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }
    await db.indicador.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting indicador:', error);
    return NextResponse.json({ error: 'Error al eliminar indicador' }, { status: 500 });
  }
}
