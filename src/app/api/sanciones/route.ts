import { NextRequest, NextResponse } from 'next/server';
import { isTurso, tursoQuery } from '@/lib/db';

// GET: Return all sanciones + counts per operator
export async function GET() {
  try {
    if (!isTurso) {
      return NextResponse.json({ sanciones: [], countsByOp: {}, total: 0 });
    }

    const result = await tursoQuery(`
      SELECT * FROM "Sancion" ORDER BY "createdAt" DESC
    `);

    const sanciones = result.rows.map(r => ({
      id: Number(r.id),
      codUti: String(r.codUti),
      nomUti: String(r.nomUti),
      turno: r.turno ? String(r.turno) : null,
      tiempoNeto: r.tiempoNeto ? Number(r.tiempoNeto) : null,
      fechaMedicion: r.fechaMedicion ? String(r.fechaMedicion) : null,
      coordinador: r.coordinador ? String(r.coordinador) : null,
      sectorCoordinador: r.sectorCoordinador ? String(r.sectorCoordinador) : null,
      rrhh: r.rrhh ? String(r.rrhh) : null,
      evidencia: r.evidencia ? String(r.evidencia) : null,
      comentariosColaborador: r.comentariosColaborador ? String(r.comentariosColaborador) : null,
      comentariosCoordinador: r.comentariosCoordinador ? String(r.comentariosCoordinador) : null,
      sugerencias: r.sugerencias ? String(r.sugerencias) : null,
      createdAt: r.createdAt ? String(r.createdAt) : null,
    }));

    const countsByOp: Record<string, { count: number; lastDate: string }> = {};
    for (const s of sanciones) {
      if (!countsByOp[s.codUti]) {
        countsByOp[s.codUti] = { count: 0, lastDate: '' };
      }
      countsByOp[s.codUti].count++;
      const d = s.createdAt || '';
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
    if (!isTurso) {
      return NextResponse.json({ error: 'Solo disponible en producción (Turso)' }, { status: 400 });
    }

    const body = await request.json();
    const { codUti, nomUti, turno, tiempoNeto, fechaMedicion, coordinador, sectorCoordinador, rrhh, evidencia, comentariosColaborador, comentariosCoordinador, sugerencias } = body;

    if (!codUti || !nomUti) {
      return NextResponse.json({ error: 'codUti y nomUti son requeridos' }, { status: 400 });
    }

    const toStr = (v: unknown) => (v !== null && v !== undefined && v !== '') ? String(v) : '';

    await tursoQuery(
      `INSERT INTO "Sancion" ("codUti","nomUti","turno","tiempoNeto","fechaMedicion","coordinador","sectorCoordinador","rrhh","evidencia","comentariosColaborador","comentariosCoordinador","sugerencias")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        String(codUti),
        String(nomUti),
        toStr(turno),
        tiempoNeto !== null && tiempoNeto !== undefined ? Number(tiempoNeto) : null,
        toStr(fechaMedicion),
        toStr(coordinador),
        toStr(sectorCoordinador),
        toStr(rrhh),
        toStr(evidencia),
        toStr(comentariosColaborador),
        toStr(comentariosCoordinador),
        toStr(sugerencias),
      ]
    );

    // Get updated count for this operator
    const countResult = await tursoQuery(`SELECT COUNT(*) as c FROM "Sancion" WHERE "codUti" = ?`, [String(codUti)]);
    const sancionCount = Number(countResult.rows[0]?.c || 0);

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
    if (!isTurso) {
      return NextResponse.json({ error: 'Solo disponible en producción (Turso)' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }

    await tursoQuery(`DELETE FROM "Sancion" WHERE "id" = ?`, [Number(id)]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sancion:', error);
    return NextResponse.json({ error: 'Error al eliminar sanción' }, { status: 500 });
  }
}