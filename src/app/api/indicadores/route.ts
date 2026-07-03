import { NextRequest, NextResponse } from 'next/server';
import { isTurso, tursoQuery } from '@/lib/db';

// GET: List all indicadores
export async function GET() {
  try {
    if (!isTurso) {
      return NextResponse.json({ indicadores: [] });
    }
    const result = await tursoQuery(`SELECT * FROM "Indicador" ORDER BY "createdAt" DESC`);
    const indicadores = result.rows.map(r => ({
      id: Number(r.id),
      fecha: String(r.fecha),
      turno: String(r.turno),
      brutoMin: Number(r.brutoMin),
      descansoMin: Number(r.descansoMin),
      tmInfMin: Number(r.tmInfMin),
      tmInfEventos: Number(r.tmInfEventos),
      netoMin: Number(r.netoMin),
      createdAt: String(r.createdAt),
    }));
    return NextResponse.json({ indicadores });
  } catch (error) {
    console.error('Error fetching indicadores:', error);
    return NextResponse.json({ indicadores: [] });
  }
}

// POST: Save a new indicador snapshot
export async function POST(request: NextRequest) {
  try {
    if (!isTurso) {
      return NextResponse.json({ error: 'Solo disponible en producción (Turso)' }, { status: 400 });
    }
    const body = await request.json();
    const { fecha, turno, brutoMin, descansoMin, tmInfMin, tmInfEventos, netoMin } = body;
    if (!fecha) {
      return NextResponse.json({ error: 'fecha es requerida' }, { status: 400 });
    }
    await tursoQuery(
      `INSERT INTO "Indicador" ("fecha","turno","brutoMin","descansoMin","tmInfMin","tmInfEventos","netoMin")
       VALUES (?,?,?,?,?,?,?)`,
      [
        String(fecha),
        String(turno || 'todos'),
        Number(brutoMin) || 0,
        Number(descansoMin) || 0,
        Number(tmInfMin) || 0,
        Number(tmInfEventos) || 0,
        Number(netoMin) || 0,
      ]
    );
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
    if (!isTurso) {
      return NextResponse.json({ error: 'Solo disponible en producción (Turso)' }, { status: 400 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }
    await tursoQuery(`DELETE FROM "Indicador" WHERE "id" = ?`, [Number(id)]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting indicador:', error);
    return NextResponse.json({ error: 'Error al eliminar indicador' }, { status: 500 });
  }
}