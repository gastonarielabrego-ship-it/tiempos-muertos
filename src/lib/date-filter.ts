/**
 * Helper para filtrar el campo `fecha` (DateTime en Prisma) por día calendario.
 *
 * El frontend envía la fecha como string "YYYY-MM-DD" (ej: "2026-10-14").
 * Prisma 6 no acepta ese string directamente para un campo DateTime y lanza
 * error de validación (HTTP 500). Hay que convertirlo a un rango de Date
 * que cubra todo el día en UTC para que matchee cualquier registro del día
 * sin importar la hora exacta guardada en la BD.
 */

/**
 * Convierte un string "YYYY-MM-DD" en un rango { gte, lte } de Date que cubre
 * todo el día calendario en UTC.
 *
 * Devuelve null si el input es inválido o vacío, para que el caller pueda
 * omitir el filtro en el `where` de Prisma.
 */
export function fechaDayRange(fechaFilter: string | null | undefined): { gte: Date; lte: Date } | null {
  if (!fechaFilter || fechaFilter === 'all') return null;
  // Validación básica de formato YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaFilter);
  if (!m) return null;
  const [, y, mo, d] = m;
  const gte = new Date(Date.UTC(+y, +mo - 1, +d, 0, 0, 0, 0));
  const lte = new Date(Date.UTC(+y, +mo - 1, +d, 23, 59, 59, 999));
  if (isNaN(gte.getTime()) || isNaN(lte.getTime())) return null;
  return { gte, lte };
}
